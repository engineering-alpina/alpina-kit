import { bearerToken, safeEqual, sha256Hex } from '@alpina/service-kit';

/**
 * Hashed bearer key to role, plus the role to allowed-tool map.
 *
 * Written three times in the fleet and about to be written a fourth:
 *   - comms-hub `packages/mcp/src/auth.ts` (the reference: SHA-256 hex hashes
 *     in env vars, one per role, plus a ROLE_TOOLS allow-list),
 *   - alpina-mcp, which comms-hub says it mirrors "exactly in structure",
 *   - alpina-portal `src/collections/AgentKeys.ts`, the same scheme as a
 *     Payload collection (label, keyHash, agentRole, isActive),
 *   - the portal's planned MCP auth, which is why this exists now.
 *
 * Generic over the role type so each service keeps its own vocabulary
 * (`cto | pm | client-success | scout` in comms-hub,
 * `viewer | author | admin` in the portal) without the kit knowing any of them.
 *
 * Two things the kit deliberately refuses to do:
 *   - **No unauthenticated role fallback.** comms-hub's `COMMS_MCP_ROLE`
 *     granted a role with no key check at all. There is no option for it here;
 *     a role only ever comes from a key that hashed to a stored value.
 *   - **No policy.** Which tools a role may call is the service's decision,
 *     passed in as data.
 */

export interface KeyVerifierOptions<TRole extends string> {
  /** Role to the env var holding that role's SHA-256 hex key hash. */
  roleEnv: Record<TRole, string>;
  /** Injectable for tests. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export interface KeyVerifier<TRole extends string> {
  /** Hashes a raw key the way stored hashes are produced. */
  hash: (rawKey: string) => string;
  /** Role for a raw key, or null. Null covers unknown, empty and unconfigured. */
  verify: (rawKey: string | undefined | null) => TRole | null;
  /** Same, reading `Authorization: Bearer <key>` off a request. */
  verifyRequest: (req: Request) => TRole | null;
  /** Roles that actually have a key configured. Useful in a health check. */
  configuredRoles: () => TRole[];
}

/**
 * Store hashes, never raw keys: `echo -n "$RAW" | shasum -a 256`.
 * Comparison goes through `safeEqual`, which hashes both sides again, so a
 * wrong key costs the same time as a right one whatever its length.
 */
export function createKeyVerifier<TRole extends string>(
  options: KeyVerifierOptions<TRole>,
): KeyVerifier<TRole> {
  const entries = Object.entries(options.roleEnv) as [TRole, string][];

  const readEnv = (): Record<string, string | undefined> => options.env ?? process.env;

  function verify(rawKey: string | undefined | null): TRole | null {
    if (!rawKey) return null;
    const incoming = sha256Hex(rawKey);
    const env = readEnv();
    for (const [role, envVar] of entries) {
      const stored = env[envVar];
      if (stored && safeEqual(stored, incoming)) return role;
    }
    return null;
  }

  return {
    hash: sha256Hex,
    verify,
    verifyRequest: (req) => verify(bearerToken(req.headers.get('authorization'))),
    configuredRoles: () => {
      const env = readEnv();
      return entries.filter(([, envVar]) => Boolean(env[envVar])).map(([role]) => role);
    },
  };
}

export interface ToolAllowlist<TRole extends string> {
  /** May this role call this tool? */
  allows: (role: TRole, tool: string) => boolean;
  /** Everything this role may call. */
  toolsFor: (role: TRole) => readonly string[];
  /**
   * The guard an MCP server actually wants: role from key, then tool check.
   * Returns the role on success so the handler can scope its query.
   */
  authorize: (
    rawKey: string | undefined | null,
    tool: string,
  ) => { ok: true; role: TRole } | { ok: false; reason: 'unauthorized' | 'forbidden' };
}

/** Wraps a service's role-to-tools map together with its key verifier. */
export function createToolAllowlist<TRole extends string>(
  verifier: KeyVerifier<TRole>,
  roleTools: Record<TRole, readonly string[]>,
): ToolAllowlist<TRole> {
  const toolsFor = (role: TRole): readonly string[] => roleTools[role] ?? [];
  return {
    toolsFor,
    allows: (role, tool) => toolsFor(role).includes(tool),
    authorize: (rawKey, tool) => {
      const role = verifier.verify(rawKey);
      if (!role) return { ok: false, reason: 'unauthorized' };
      if (!toolsFor(role).includes(tool)) return { ok: false, reason: 'forbidden' };
      return { ok: true, role };
    },
  };
}
