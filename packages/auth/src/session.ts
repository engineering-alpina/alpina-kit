import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { clearCookie, readCookie, serializeCookie } from '@alpina/service-kit';

/**
 * Session cookies for the fleet. Two shapes exist and both are legitimate.
 *
 * 1. **Stateless** (`<expiryEpochSeconds>.<hmac>`), invoicing's shape. No table,
 *    no lookup, verified on every request from the signing key alone. Right for
 *    an app with no user management, wrong when a session has to be revocable.
 *    Shipped here in full as `createStatelessSessions`.
 * 2. **Database-backed**, upwork-crm's shape: an opaque id whose row carries the
 *    user, expiry and revocation. The token half stays in the owning service
 *    (it needs the service's tables); what both shapes share is the cookie
 *    plumbing, exported here as `createSessionCookie` and the `SessionCookies`
 *    interface so a DB-backed app reuses the same header handling.
 */

export interface SessionCookieOptions {
  name: string;
  /** Seconds. Defaults to 30 days, the fleet default. */
  maxAge?: number;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
  /** Defaults to true when NODE_ENV === 'production'. */
  secure?: boolean;
}

/** The cookie half of a session, shared by the stateless and DB-backed shapes. */
export interface SessionCookies {
  readonly name: string;
  /** `Set-Cookie` value that stores a token. */
  set: (token: string) => string;
  /** `Set-Cookie` value that removes it (logout). */
  clear: () => string;
  /** Reads the raw token out of a request, if present. */
  read: (req: Request) => string | undefined;
  /** Reads the raw token out of a `Cookie:` header value. */
  readHeader: (header: string | null | undefined) => string | undefined;
}

export const DEFAULT_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export function createSessionCookie(options: SessionCookieOptions): SessionCookies {
  const { name, maxAge = DEFAULT_SESSION_MAX_AGE, path = '/', sameSite = 'Lax' } = options;
  const base = {
    path,
    sameSite,
    httpOnly: true,
    ...(options.secure === undefined ? {} : { secure: options.secure }),
  };
  return {
    name,
    set: (token) => serializeCookie(name, token, { ...base, maxAge }),
    clear: () => clearCookie(name, base),
    read: (req) => readCookie(req.headers.get('cookie'), name),
    readHeader: (header) => readCookie(header, name),
  };
}

export interface StatelessSessionOptions extends SessionCookieOptions {
  /**
   * HMAC key. Pass the raw secret; it is never stored or logged.
   * Callers with only a shared password can derive one with `deriveSecret`.
   */
  secret: string;
  /** Injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface StatelessSessions extends SessionCookies {
  /** Mints a token valid for `maxAge` seconds. */
  issue: () => string;
  /** True only for a well-formed, unexpired, correctly signed token. */
  verify: (token: string | undefined) => boolean;
  /** Convenience: verify whatever the request's cookie holds. */
  verifyRequest: (req: Request) => boolean;
}

/**
 * Derives a signing key from a shared password. Invoicing does this so a
 * deployment with only `INVOICING_PASSWORD` still gets signed sessions; a real
 * `SESSION_SECRET` is preferred and rotating it logs everyone out.
 */
export function deriveSecret(namespace: string, password: string): string {
  return createHash('sha256').update(`${namespace}:${password}`).digest('hex');
}

export function createStatelessSessions(options: StatelessSessionOptions): StatelessSessions {
  const { secret, maxAge = DEFAULT_SESSION_MAX_AGE, now = () => Date.now() } = options;
  if (!secret) throw new Error('createStatelessSessions: secret is required');
  const cookies = createSessionCookie(options);

  const sign = (payload: string): Buffer => createHmac('sha256', secret).update(payload).digest();

  function verify(token: string | undefined): boolean {
    if (!token) return false;
    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const exp = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    if (!/^\d+$/.test(exp)) return false;
    if (Number(exp) < Math.floor(now() / 1000)) return false;
    // Both sides are fixed-width 32-byte digests, so the comparison time does
    // not depend on the candidate and no length can leak. Buffer.from(_, 'hex')
    // truncates on invalid hex rather than throwing, which the length check
    // below then rejects.
    const candidate = Buffer.from(mac, 'hex');
    const expected = sign(exp);
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  }

  return {
    ...cookies,
    issue: () => {
      const exp = String(Math.floor(now() / 1000) + maxAge);
      return `${exp}.${sign(exp).toString('hex')}`;
    },
    verify,
    verifyRequest: (req) => verify(cookies.read(req)),
  };
}
