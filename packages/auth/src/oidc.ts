import { createHash, randomBytes } from 'node:crypto';
import { readCookie } from '@alpina/service-kit';

/**
 * Zitadel OIDC, authorization code + PKCE, confidential client.
 *
 * Unified from two hand-written copies that had already drifted:
 * upwork-crm `viewer/lib/auth/sso.ts` and invoicing `app/lib/sso.ts`. They
 * differed in whether `newStatePayload` returned the verifier, and invoicing's
 * file also carried `emailAllowed()`, an authorization policy.
 *
 * **The kit stops at the email.** Fleet rule 3 is authn centralized, authz
 * local: Zitadel says who you are, the calling app decides what that identity
 * may do (upwork-crm looks the email up in its users table, invoicing checks
 * an allowlist). No allowlist, no role map and no users table lives here.
 */

export interface SsoConfig {
  /** Issuer origin, no trailing slash, e.g. `https://auth.alpina-tech.org`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Defaults to `openid email profile`. */
  scope?: string;
}

export interface SsoEnvOptions {
  /** Env var prefix. Defaults to `SSO`, giving SSO_ISSUER / SSO_CLIENT_ID / SSO_CLIENT_SECRET. */
  prefix?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Returns null unless issuer, client id and secret are all present. Both
 * consumers rely on that: a partially configured environment means SSO is off
 * and the app's password fallback stays in charge, rather than a half-built
 * redirect to a missing IdP.
 */
export function ssoConfigFromEnv(options: SsoEnvOptions = {}): SsoConfig | null {
  const { prefix = 'SSO', env = process.env } = options;
  const issuer = env[`${prefix}_ISSUER`];
  const clientId = env[`${prefix}_CLIENT_ID`];
  const clientSecret = env[`${prefix}_CLIENT_SECRET`];
  if (!issuer || !clientId || !clientSecret) return null;
  const scope = env[`${prefix}_SCOPE`];
  return {
    issuer: issuer.replace(/\/$/, ''),
    clientId,
    clientSecret,
    ...(scope ? { scope } : {}),
  };
}

/** Cookie holding the pending state, verifier and return path during the round trip. */
export const SSO_STATE_COOKIE = 'sso_state';

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export interface StatePayload {
  /** Opaque value echoed by the IdP; guards against CSRF on the callback. */
  state: string;
  /** PKCE code verifier. Never leaves the cookie. */
  verifier: string;
  /** S256 hash of the verifier; the only half that goes to the IdP. */
  challenge: string;
  /** Base64url blob to store in the state cookie. */
  cookieValue: string;
  /** Path to return to after login. */
  from: string;
}

/** Mints state + PKCE verifier/challenge and the cookie blob that carries them. */
export function newStatePayload(from = '/'): StatePayload {
  const state = b64url(randomBytes(16));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const cookieValue = b64url(Buffer.from(JSON.stringify({ state, verifier, from })));
  return { state, verifier, challenge, cookieValue, from };
}

export interface ParsedState {
  state: string;
  verifier: string;
  from: string;
}

/** Reverses `newStatePayload`. Returns null on anything malformed. */
export function parseStateCookie(raw: string | undefined): ParsedState | null {
  if (!raw) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) return null;
    const d = decoded as Record<string, unknown>;
    if (typeof d['state'] !== 'string' || typeof d['verifier'] !== 'string') return null;
    return {
      state: d['state'],
      verifier: d['verifier'],
      from: typeof d['from'] === 'string' ? d['from'] : '/',
    };
  } catch {
    return null;
  }
}

/**
 * Origin as the browser sees it. Traefik and Cloudflare sit in front of every
 * container, so `req.url`'s host is the internal one and would produce a
 * redirect URI the IdP has never heard of.
 */
export function requestOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

export interface AuthorizeUrlOptions {
  redirectUri: string;
  state: string;
  challenge: string;
}

export function authorizeUrl(cfg: SsoConfig, opts: AuthorizeUrlOptions): string {
  const u = new URL(`${cfg.issuer}/oauth/v2/authorize`);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', cfg.scope ?? 'openid email profile');
  u.searchParams.set('state', opts.state);
  u.searchParams.set('code_challenge', opts.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ExchangeOptions {
  code: string;
  verifier: string;
  redirectUri: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: FetchLike;
}

export interface TokenSet {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/** Token endpoint call. Client credentials go in the Basic header, per Zitadel's default. */
export async function exchangeCode(cfg: SsoConfig, opts: ExchangeOptions): Promise<TokenSet> {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await doFetch(`${cfg.issuer}/oauth/v2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.verifier,
    }).toString(),
  });
  if (!res.ok) throw new Error(`SSO token exchange failed: ${res.status}`);
  const tokens = (await res.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token) throw new Error('SSO token exchange returned no access_token');
  return {
    accessToken: tokens.access_token,
    ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    ...(tokens.expires_in === undefined ? {} : { expiresIn: tokens.expires_in }),
  };
}

export interface UserInfo {
  email: string;
  emailVerified?: boolean;
  name?: string;
  sub?: string;
}

export async function fetchUserInfo(
  cfg: SsoConfig,
  accessToken: string,
  fetchImpl?: FetchLike,
): Promise<UserInfo> {
  const doFetch = fetchImpl ?? ((input, init) => fetch(input, init));
  const res = await doFetch(`${cfg.issuer}/oidc/v1/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`SSO userinfo failed: ${res.status}`);
  const info = (await res.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    sub?: string;
  };
  if (!info.email) throw new Error('SSO userinfo returned no email');
  return {
    email: info.email,
    ...(info.email_verified === undefined ? {} : { emailVerified: info.email_verified }),
    ...(info.name ? { name: info.name } : {}),
    ...(info.sub ? { sub: info.sub } : {}),
  };
}

/** Code to email in one call. The shape both consumers already use. */
export async function exchangeCodeForEmail(cfg: SsoConfig, opts: ExchangeOptions): Promise<string> {
  const tokens = await exchangeCode(cfg, opts);
  const info = await fetchUserInfo(cfg, tokens.accessToken, opts.fetchImpl);
  return info.email;
}

export interface BeginLoginOptions {
  redirectUri: string;
  /** Path to return to after the round trip. Defaults to `/`. */
  from?: string;
}

export interface BeginLogin {
  /** Send the browser here. */
  url: string;
  /** Store this under `stateCookieName` for the callback to read. */
  stateCookieValue: string;
  stateCookieName: string;
}

/** Step one of the flow: mint PKCE state and build the authorize URL. */
export function beginLogin(
  cfg: SsoConfig,
  opts: BeginLoginOptions,
  stateCookieName = SSO_STATE_COOKIE,
): BeginLogin {
  const payload = newStatePayload(opts.from ?? '/');
  return {
    url: authorizeUrl(cfg, {
      redirectUri: opts.redirectUri,
      state: payload.state,
      challenge: payload.challenge,
    }),
    stateCookieValue: payload.cookieValue,
    stateCookieName,
  };
}

/** Why a callback did not produce an identity. Maps to the `?error=` codes in use today. */
export type CallbackError = 'sso-disabled' | 'sso-state' | 'sso-failed';

export type CallbackResult =
  | { ok: true; email: string; info: UserInfo; from: string }
  | { ok: false; error: CallbackError; detail?: string };

export interface CompleteLoginOptions {
  req: Request;
  /** Must byte-match the redirect_uri sent to the authorize endpoint. */
  redirectUri?: string;
  stateCookieName?: string;
  fetchImpl?: FetchLike;
}

/**
 * Step two: validate the callback and resolve the identity. Never throws, so a
 * route handler is a switch on the result rather than a try/catch.
 *
 * The caller decides what happens next. That decision is authorization and it
 * belongs to the app, not here.
 */
export async function completeLogin(
  cfg: SsoConfig | null,
  opts: CompleteLoginOptions,
): Promise<CallbackResult> {
  if (!cfg) return { ok: false, error: 'sso-disabled' };

  const { req, stateCookieName = SSO_STATE_COOKIE } = opts;
  const origin = requestOrigin(req);
  const redirectUri = opts.redirectUri ?? `${origin}/api/auth/sso/callback`;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = parseStateCookie(readCookie(req.headers.get('cookie'), stateCookieName));
  if (!code || !state || !saved || saved.state !== state) {
    return { ok: false, error: 'sso-state' };
  }

  try {
    const tokens = await exchangeCode(cfg, {
      code,
      verifier: saved.verifier,
      redirectUri,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    const info = await fetchUserInfo(cfg, tokens.accessToken, opts.fetchImpl);
    return { ok: true, email: info.email, info, from: saved.from };
  } catch (err) {
    return {
      ok: false,
      error: 'sso-failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Verifies a PKCE challenge against its verifier. Used by the round-trip test. */
export function pkceChallengeFor(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest());
}
