/**
 * `@alpina/auth` — who the caller is. Never what they may do.
 *
 * Fleet rule 3: authn centralized (Zitadel at auth.alpina-tech.org), authz
 * local (each app's own users table or allowlist). Everything in this package
 * stops at an identity: an email from OIDC, a valid session cookie, or a role
 * that a hashed key proved. The policy that turns those into permissions lives
 * in the consuming service.
 */

export {
  SSO_STATE_COOKIE,
  ssoConfigFromEnv,
  newStatePayload,
  parseStateCookie,
  requestOrigin,
  authorizeUrl,
  exchangeCode,
  fetchUserInfo,
  exchangeCodeForEmail,
  beginLogin,
  completeLogin,
  pkceChallengeFor,
  type SsoConfig,
  type SsoEnvOptions,
  type StatePayload,
  type ParsedState,
  type AuthorizeUrlOptions,
  type ExchangeOptions,
  type TokenSet,
  type UserInfo,
  type BeginLoginOptions,
  type BeginLogin,
  type CallbackError,
  type CallbackResult,
  type CompleteLoginOptions,
  type FetchLike,
} from './oidc.js';

export {
  DEFAULT_SESSION_MAX_AGE,
  createSessionCookie,
  createStatelessSessions,
  deriveSecret,
  type SessionCookies,
  type SessionCookieOptions,
  type StatelessSessions,
  type StatelessSessionOptions,
} from './session.js';

export {
  createKeyVerifier,
  createToolAllowlist,
  type KeyVerifier,
  type KeyVerifierOptions,
  type ToolAllowlist,
} from './api-keys.js';
