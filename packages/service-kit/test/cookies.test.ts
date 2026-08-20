import { describe, expect, it } from 'vitest';
import { clearCookie, readCookie, readRequestCookie, serializeCookie } from '../src/cookies.js';

describe('readCookie', () => {
  it('finds a cookie among several', () => {
    expect(readCookie('a=1; invoicing_session=tok; b=2', 'invoicing_session')).toBe('tok');
  });

  it('returns undefined for a missing cookie or header', () => {
    expect(readCookie('a=1', 'b')).toBeUndefined();
    expect(readCookie(null, 'a')).toBeUndefined();
    expect(readCookie(undefined, 'a')).toBeUndefined();
  });

  it('keeps "=" inside the value (base64url state cookies carry padding)', () => {
    expect(readCookie('sso_state=eyJhIjoxfQ==', 'sso_state')).toBe('eyJhIjoxfQ==');
  });

  it('url-decodes the value', () => {
    expect(readCookie('from=%2Fcrm%2Fleads', 'from')).toBe('/crm/leads');
  });

  it('does not match a prefix of another cookie name', () => {
    expect(readCookie('session_id=1; session=2', 'session')).toBe('2');
  });
});

describe('readRequestCookie', () => {
  it('reads from a Request', () => {
    const req = new Request('https://invoicing.alpina-tech.org/', {
      headers: { cookie: 'invoicing_session=abc' },
    });
    expect(readRequestCookie(req, 'invoicing_session')).toBe('abc');
  });
});

describe('serializeCookie', () => {
  it('writes the fleet default shape', () => {
    expect(serializeCookie('s', 'v', { maxAge: 60, secure: false })).toBe(
      's=v; HttpOnly; Path=/; SameSite=Lax; Max-Age=60',
    );
  });

  it('adds Secure when asked', () => {
    expect(serializeCookie('s', 'v', { maxAge: 60, secure: true })).toContain('; Secure');
  });

  it('omits Max-Age for a session cookie', () => {
    expect(serializeCookie('s', 'v', { secure: false })).not.toContain('Max-Age');
  });
});

describe('clearCookie', () => {
  it('expires the cookie immediately', () => {
    expect(clearCookie('s', { secure: false })).toBe(
      's=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    );
  });
});
