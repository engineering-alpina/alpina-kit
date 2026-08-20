import { describe, expect, it } from 'vitest';
import {
  createSessionCookie,
  createStatelessSessions,
  deriveSecret,
  DEFAULT_SESSION_MAX_AGE,
} from '../src/session.js';

describe('createSessionCookie', () => {
  const cookies = createSessionCookie({ name: 'invoicing_session', secure: false });

  it('writes an HttpOnly, Lax, path-scoped cookie', () => {
    expect(cookies.set('tok')).toBe(
      `invoicing_session=tok; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DEFAULT_SESSION_MAX_AGE}`,
    );
  });

  it('clears with Max-Age=0', () => {
    expect(cookies.clear()).toContain('Max-Age=0');
  });

  it('reads its own cookie back off a request', () => {
    const req = new Request('https://invoicing.alpina-tech.org/', {
      headers: { cookie: 'other=1; invoicing_session=tok' },
    });
    expect(cookies.read(req)).toBe('tok');
  });

  it('is the shared half a database-backed app reuses', () => {
    // upwork-crm stores an opaque session id in a table; only the token minting
    // differs, so it takes the same cookie plumbing.
    const dbBacked = createSessionCookie({ name: 'crm_session', secure: false });
    expect(dbBacked.set('opaque-row-id')).toContain('crm_session=opaque-row-id');
    expect(dbBacked.name).toBe('crm_session');
  });
});

describe('createStatelessSessions', () => {
  const secret = 'signing-key';
  const base = { name: 'invoicing_session', secret, secure: false };

  it('issues a token that verifies', () => {
    const sessions = createStatelessSessions(base);
    expect(sessions.verify(sessions.issue())).toBe(true);
  });

  it('uses the exp.hmac shape invoicing already ships', () => {
    const sessions = createStatelessSessions({ ...base, now: () => 1_700_000_000_000 });
    const [exp, mac] = sessions.issue().split('.');
    expect(Number(exp)).toBe(1_700_000_000 + DEFAULT_SESSION_MAX_AGE);
    expect(mac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an expired token', () => {
    let clock = 1_700_000_000_000;
    const sessions = createStatelessSessions({ ...base, maxAge: 60, now: () => clock });
    const token = sessions.issue();
    expect(sessions.verify(token)).toBe(true);
    clock += 61_000;
    expect(sessions.verify(token)).toBe(false);
  });

  it('rejects a tampered expiry: the signature covers it', () => {
    const sessions = createStatelessSessions({ ...base, maxAge: 60 });
    const [, mac] = sessions.issue().split('.');
    const farFuture = String(Math.floor(Date.now() / 1000) + 999_999);
    expect(sessions.verify(`${farFuture}.${mac}`)).toBe(false);
  });

  it('rejects a token signed with another key', () => {
    const mine = createStatelessSessions(base);
    const theirs = createStatelessSessions({ ...base, secret: 'other-key' });
    expect(mine.verify(theirs.issue())).toBe(false);
  });

  it('rejects malformed tokens without throwing', () => {
    const sessions = createStatelessSessions(base);
    for (const bad of [undefined, '', 'nodot', '.abc', 'abc.', 'notanumber.abc', 'x.y.z']) {
      expect(sessions.verify(bad)).toBe(false);
    }
  });

  it('rejects a non-hex signature of the right visual length', () => {
    const sessions = createStatelessSessions(base);
    const [exp] = sessions.issue().split('.');
    expect(sessions.verify(`${exp}.${'z'.repeat(64)}`)).toBe(false);
  });

  it('verifies straight off a request', () => {
    const sessions = createStatelessSessions(base);
    const req = new Request('https://invoicing.alpina-tech.org/', {
      headers: { cookie: `invoicing_session=${sessions.issue()}` },
    });
    expect(sessions.verifyRequest(req)).toBe(true);
    expect(sessions.verifyRequest(new Request('https://invoicing.alpina-tech.org/'))).toBe(false);
  });

  it('refuses to run without a secret', () => {
    expect(() => createStatelessSessions({ ...base, secret: '' })).toThrow('secret is required');
  });
});

describe('deriveSecret', () => {
  it('is deterministic per namespace and password', () => {
    expect(deriveSecret('invoicing-session', 'pw')).toBe(deriveSecret('invoicing-session', 'pw'));
    expect(deriveSecret('invoicing-session', 'pw')).not.toBe(deriveSecret('crm-session', 'pw'));
    expect(deriveSecret('invoicing-session', 'pw')).not.toBe(
      deriveSecret('invoicing-session', 'pw2'),
    );
  });

  it('matches the derivation invoicing already deployed, so sessions survive adoption', () => {
    // invoicing app/lib/auth.ts: sha256(`invoicing-session:${INVOICING_PASSWORD}`)
    expect(deriveSecret('invoicing-session', 'hunter2')).toBe(
      '2b929b17d4823d10fad079e562523b6b31e9734bd47a9ea6a7a4cb7635e2cad7',
    );
  });
});
