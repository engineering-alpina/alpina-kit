import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createKeyVerifier, createToolAllowlist } from '../src/api-keys.js';

// comms-hub's real vocabulary, so the generic is exercised with a live example.
type CommsRole = 'cto' | 'pm' | 'client-success' | 'scout';

const RAW = {
  cto: 'raw-cto-key',
  scout: 'raw-scout-key',
};

const env: Record<string, string | undefined> = {
  COMMS_MCP_KEY_CTO: createHash('sha256').update(RAW.cto).digest('hex'),
  COMMS_MCP_KEY_SCOUT: createHash('sha256').update(RAW.scout).digest('hex'),
  // pm and client-success deliberately unconfigured.
};

const verifier = createKeyVerifier<CommsRole>({
  roleEnv: {
    cto: 'COMMS_MCP_KEY_CTO',
    pm: 'COMMS_MCP_KEY_PM',
    'client-success': 'COMMS_MCP_KEY_CS',
    scout: 'COMMS_MCP_KEY_SCOUT',
  },
  env,
});

describe('createKeyVerifier', () => {
  it('resolves a configured key to its role', () => {
    expect(verifier.verify(RAW.cto)).toBe('cto');
    expect(verifier.verify(RAW.scout)).toBe('scout');
  });

  it('rejects an unknown key', () => {
    expect(verifier.verify('not-a-key')).toBeNull();
    expect(verifier.verify('raw-cto-ke')).toBeNull();
    expect(verifier.verify(`${RAW.cto} `)).toBeNull();
  });

  it('rejects an empty, missing or null key', () => {
    expect(verifier.verify('')).toBeNull();
    expect(verifier.verify(undefined)).toBeNull();
    expect(verifier.verify(null)).toBeNull();
  });

  it('grants nothing for a role whose env var is unset', () => {
    // The hole this closes: comms-hub's COMMS_MCP_ROLE handed out a role with
    // no key check at all. Here an unconfigured role is simply unreachable.
    expect(verifier.configuredRoles().sort()).toEqual(['cto', 'scout']);
    expect(verifier.verify('')).toBeNull();
  });

  it('hashes the way stored hashes are produced', () => {
    expect(verifier.hash(RAW.cto)).toBe(env['COMMS_MCP_KEY_CTO']);
  });

  it('reads Authorization: Bearer off a request', () => {
    const good = new Request('https://comms.alpina-tech.org/api/threads', {
      headers: { authorization: `Bearer ${RAW.cto}` },
    });
    expect(verifier.verifyRequest(good)).toBe('cto');

    const wrongScheme = new Request('https://comms.alpina-tech.org/api/threads', {
      headers: { authorization: `Basic ${RAW.cto}` },
    });
    expect(verifier.verifyRequest(wrongScheme)).toBeNull();
    expect(verifier.verifyRequest(new Request('https://comms.alpina-tech.org/api/threads'))).toBe(
      null,
    );
  });
});

describe('createToolAllowlist', () => {
  const allowlist = createToolAllowlist<CommsRole>(verifier, {
    scout: ['comms_list_threads', 'comms_get_thread', 'comms_search'],
    pm: ['comms_list_threads', 'comms_get_thread', 'comms_list_messages', 'comms_search'],
    'client-success': ['comms_list_threads', 'comms_get_thread', 'comms_list_messages'],
    cto: ['comms_list_threads', 'comms_get_thread', 'comms_list_messages', 'comms_search'],
  });

  it('answers per role', () => {
    expect(allowlist.allows('scout', 'comms_search')).toBe(true);
    expect(allowlist.allows('scout', 'comms_list_messages')).toBe(false);
    expect(allowlist.toolsFor('scout')).toHaveLength(3);
  });

  it('authorize returns the role for a valid key and an allowed tool', () => {
    expect(allowlist.authorize(RAW.cto, 'comms_list_messages')).toEqual({ ok: true, role: 'cto' });
  });

  it('separates unauthorized from forbidden', () => {
    expect(allowlist.authorize('bogus', 'comms_search')).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    expect(allowlist.authorize(RAW.scout, 'comms_list_messages')).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('an unknown key never reaches the tool check', () => {
    expect(allowlist.authorize(undefined, 'comms_list_threads')).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });
});

describe('generic over the role type', () => {
  it('works with the portal’s viewer/author/admin vocabulary too', () => {
    type PortalRole = 'viewer' | 'author' | 'admin';
    const portalEnv = {
      PORTAL_MCP_KEY_ADMIN: createHash('sha256').update('portal-admin').digest('hex'),
    };
    const portal = createKeyVerifier<PortalRole>({
      roleEnv: {
        viewer: 'PORTAL_MCP_KEY_VIEWER',
        author: 'PORTAL_MCP_KEY_AUTHOR',
        admin: 'PORTAL_MCP_KEY_ADMIN',
      },
      env: portalEnv,
    });
    expect(portal.verify('portal-admin')).toBe('admin');
    expect(portal.verify('portal-author')).toBeNull();
  });
});
