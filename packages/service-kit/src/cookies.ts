/**
 * Cookie-header parsing. Unified from two byte-identical copies in invoicing
 * (`app/lib/auth.ts` and `app/app/api/auth/sso/callback/route.ts`).
 *
 * Header parsing only: nothing here knows about sessions. Session cookie
 * writing and clearing live in `@alpina/auth`.
 */

/** Reads one cookie out of a raw `Cookie:` header value. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Convenience wrapper for a `Request`. */
export function readRequestCookie(req: Request, name: string): string | undefined {
  return readCookie(req.headers.get('cookie'), name);
}

export interface CookieOptions {
  /** Seconds. Omit for a session cookie; 0 clears. */
  maxAge?: number;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
  httpOnly?: boolean;
  /** Defaults to true when NODE_ENV === 'production'. */
  secure?: boolean;
}

/**
 * Serialises a `Set-Cookie` value. The fleet default is the invoicing shape:
 * HttpOnly, Path=/, SameSite=Lax, Secure in production.
 */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const {
    maxAge,
    path = '/',
    sameSite = 'Lax',
    httpOnly = true,
    secure = process.env['NODE_ENV'] === 'production',
  } = options;
  const parts = [`${name}=${value}`];
  if (httpOnly) parts.push('HttpOnly');
  parts.push(`Path=${path}`);
  parts.push(`SameSite=${sameSite}`);
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** `Set-Cookie` value that deletes a cookie. */
export function clearCookie(name: string, options: Omit<CookieOptions, 'maxAge'> = {}): string {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}
