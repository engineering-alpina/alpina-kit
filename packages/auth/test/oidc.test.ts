import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  authorizeUrl,
  beginLogin,
  completeLogin,
  exchangeCode,
  exchangeCodeForEmail,
  fetchUserInfo,
  newStatePayload,
  parseStateCookie,
  pkceChallengeFor,
  requestOrigin,
  ssoConfigFromEnv,
  SSO_STATE_COOKIE,
  type FetchLike,
  type SsoConfig,
} from '../src/oidc.js';

const cfg: SsoConfig = {
  issuer: 'https://auth.alpina-tech.org',
  clientId: 'client-1',
  clientSecret: 'secret-1',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ssoConfigFromEnv', () => {
  it('needs all three variables', () => {
    expect(ssoConfigFromEnv({ env: {} })).toBeNull();
    expect(ssoConfigFromEnv({ env: { SSO_ISSUER: 'https://x', SSO_CLIENT_ID: 'a' } })).toBeNull();
  });

  it('builds a config and trims the trailing slash', () => {
    const parsed = ssoConfigFromEnv({
      env: {
        SSO_ISSUER: 'https://auth.alpina-tech.org/',
        SSO_CLIENT_ID: 'a',
        SSO_CLIENT_SECRET: 'b',
      },
    });
    expect(parsed).toEqual({
      issuer: 'https://auth.alpina-tech.org',
      clientId: 'a',
      clientSecret: 'b',
    });
  });

  it('supports a per-app prefix', () => {
    const parsed = ssoConfigFromEnv({
      prefix: 'CRM_SSO',
      env: { CRM_SSO_ISSUER: 'https://x', CRM_SSO_CLIENT_ID: 'a', CRM_SSO_CLIENT_SECRET: 'b' },
    });
    expect(parsed?.clientId).toBe('a');
  });
});

describe('PKCE round trip', () => {
  it('challenge is the base64url S256 hash of the verifier', () => {
    const payload = newStatePayload('/crm/leads');
    const expected = createHash('sha256').update(payload.verifier).digest('base64url');
    expect(payload.challenge).toBe(expected);
    expect(pkceChallengeFor(payload.verifier)).toBe(payload.challenge);
  });

  it('state cookie carries state, verifier and return path back intact', () => {
    const payload = newStatePayload('/invoices/new');
    const parsed = parseStateCookie(payload.cookieValue);
    expect(parsed).toEqual({
      state: payload.state,
      verifier: payload.verifier,
      from: '/invoices/new',
    });
  });

  it('sends only the challenge to the IdP, never the verifier', () => {
    const payload = newStatePayload();
    const url = new URL(
      authorizeUrl(cfg, {
        redirectUri: 'https://invoicing.alpina-tech.org/api/auth/sso/callback',
        state: payload.state,
        challenge: payload.challenge,
      }),
    );
    expect(url.searchParams.get('code_challenge')).toBe(payload.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.toString()).not.toContain(payload.verifier);
  });

  it('mints a fresh verifier every time', () => {
    const a = newStatePayload();
    const b = newStatePayload();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
  });

  it('rejects a tampered or malformed state cookie', () => {
    expect(parseStateCookie(undefined)).toBeNull();
    expect(parseStateCookie('not-base64url-json')).toBeNull();
    expect(parseStateCookie(Buffer.from('{"state":"a"}').toString('base64url'))).toBeNull();
    expect(parseStateCookie(Buffer.from('[]').toString('base64url'))).toBeNull();
  });

  it('defaults the return path when the cookie omits it', () => {
    const raw = Buffer.from(JSON.stringify({ state: 's', verifier: 'v' })).toString('base64url');
    expect(parseStateCookie(raw)?.from).toBe('/');
  });
});

describe('authorizeUrl', () => {
  it('builds Zitadel’s authorize endpoint with the fleet defaults', () => {
    const url = new URL(
      authorizeUrl(cfg, { redirectUri: 'https://x/cb', state: 's', challenge: 'c' }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.alpina-tech.org/oauth/v2/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x/cb');
  });

  it('honours a custom scope', () => {
    const url = new URL(
      authorizeUrl(
        { ...cfg, scope: 'openid email' },
        { redirectUri: 'https://x/cb', state: 's', challenge: 'c' },
      ),
    );
    expect(url.searchParams.get('scope')).toBe('openid email');
  });
});

describe('requestOrigin', () => {
  it('trusts the proxy headers Traefik and Cloudflare set', () => {
    const req = new Request('http://container:3000/api/auth/sso/callback', {
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'invoicing.alpina-tech.org',
        host: 'container:3000',
      },
    });
    expect(requestOrigin(req)).toBe('https://invoicing.alpina-tech.org');
  });

  it('falls back to the Host header', () => {
    const req = new Request('http://localhost:4418/x', { headers: { host: 'localhost:4418' } });
    expect(requestOrigin(req)).toBe('http://localhost:4418');
  });
});

describe('exchangeCode', () => {
  it('posts the verifier with Basic client credentials', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ access_token: 'at', expires_in: 300 }));
    const tokens = await exchangeCode(cfg, {
      code: 'the-code',
      verifier: 'the-verifier',
      redirectUri: 'https://x/cb',
      fetchImpl,
    });
    expect(tokens).toEqual({ accessToken: 'at', expiresIn: 300 });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://auth.alpina-tech.org/oauth/v2/token');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(
      `Basic ${Buffer.from('client-1:secret-1').toString('base64')}`,
    );
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('redirect_uri')).toBe('https://x/cb');
  });

  it('throws with the status when the IdP refuses', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(
      exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r', fetchImpl }),
    ).rejects.toThrow('SSO token exchange failed: 401');
  });

  it('throws when the response carries no access token', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ id_token: 'only' }));
    await expect(
      exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r', fetchImpl }),
    ).rejects.toThrow('no access_token');
  });
});

describe('fetchUserInfo', () => {
  it('returns the verified email', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ email: 'engineering@alpina-tech.com', email_verified: true, sub: '42' }),
      );
    await expect(fetchUserInfo(cfg, 'at', fetchImpl)).resolves.toEqual({
      email: 'engineering@alpina-tech.com',
      emailVerified: true,
      sub: '42',
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://auth.alpina-tech.org/oidc/v1/userinfo');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer at');
  });

  it('throws when userinfo has no email', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ sub: '42' }));
    await expect(fetchUserInfo(cfg, 'at', fetchImpl)).rejects.toThrow('no email');
  });
});

describe('exchangeCodeForEmail', () => {
  it('chains the two calls', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at' }))
      .mockResolvedValueOnce(jsonResponse({ email: 'dmitry@antonyuk.org' }));
    await expect(
      exchangeCodeForEmail(cfg, { code: 'c', verifier: 'v', redirectUri: 'r', fetchImpl }),
    ).resolves.toBe('dmitry@antonyuk.org');
  });
});

describe('beginLogin / completeLogin', () => {
  const redirectUri = 'https://invoicing.alpina-tech.org/api/auth/sso/callback';

  function callbackRequest(state: string, cookie: string, code = 'the-code'): Request {
    return new Request(`${redirectUri}?code=${code}&state=${encodeURIComponent(state)}`, {
      headers: { cookie: `${SSO_STATE_COOKIE}=${cookie}`, host: 'invoicing.alpina-tech.org' },
    });
  }

  it('completes a full round trip and hands back the email', async () => {
    const started = beginLogin(cfg, { redirectUri, from: '/invoices' });
    const state = new URL(started.url).searchParams.get('state') ?? '';
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at' }))
      .mockResolvedValueOnce(jsonResponse({ email: 'engineering@alpina-tech.com' }));

    const result = await completeLogin(cfg, {
      req: callbackRequest(state, started.stateCookieValue),
      redirectUri,
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      email: 'engineering@alpina-tech.com',
      from: '/invoices',
    });
    // The verifier from the cookie, not the challenge, reaches the token endpoint.
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const parsed = parseStateCookie(started.stateCookieValue);
    expect(body.get('code_verifier')).toBe(parsed?.verifier);
  });

  it('says sso-disabled when the app has no SSO config', async () => {
    const result = await completeLogin(null, { req: callbackRequest('s', 'c') });
    expect(result).toEqual({ ok: false, error: 'sso-disabled' });
  });

  it('rejects a state that does not match the cookie (CSRF guard)', async () => {
    const started = beginLogin(cfg, { redirectUri });
    const fetchImpl = vi.fn<FetchLike>();
    const result = await completeLogin(cfg, {
      req: callbackRequest('someone-elses-state', started.stateCookieValue),
      redirectUri,
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, error: 'sso-state' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a callback with no state cookie at all', async () => {
    const req = new Request(`${redirectUri}?code=c&state=s`, {
      headers: { host: 'invoicing.alpina-tech.org' },
    });
    await expect(completeLogin(cfg, { req, redirectUri })).resolves.toEqual({
      ok: false,
      error: 'sso-state',
    });
  });

  it('turns an IdP failure into a typed result rather than a throw', async () => {
    const started = beginLogin(cfg, { redirectUri });
    const state = new URL(started.url).searchParams.get('state') ?? '';
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await completeLogin(cfg, {
      req: callbackRequest(state, started.stateCookieValue),
      redirectUri,
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: false, error: 'sso-failed', detail: 'ECONNREFUSED' });
  });

  it('carries no authorization decision: an unknown email still resolves ok', async () => {
    // The kit must not know about allowlists or users tables. A stranger who
    // authenticates successfully is `ok: true`; rejecting them is the app's job.
    const started = beginLogin(cfg, { redirectUri });
    const state = new URL(started.url).searchParams.get('state') ?? '';
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at' }))
      .mockResolvedValueOnce(jsonResponse({ email: 'stranger@example.com' }));
    const result = await completeLogin(cfg, {
      req: callbackRequest(state, started.stateCookieValue),
      redirectUri,
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email).toBe('stranger@example.com');
  });
});
