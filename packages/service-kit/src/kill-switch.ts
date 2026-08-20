/**
 * Kill switch for background workers, generalised from upwork-crm's
 * `worker/sync-once.ts`:
 *
 * ```ts
 * if (process.env.UPWORK_SYNC_ENABLED !== '1') {
 *   console.log('[sync] UPWORK_SYNC_ENABLED != 1 — kill-switch on, exiting');
 *   return 0;
 * }
 * ```
 *
 * Two properties matter and both are preserved here.
 *
 * 1. **Default off.** An unset variable means disabled. A worker that starts
 *    because someone forgot a variable is worse than one that does not start:
 *    the upwork sync fights the other instance over the same OAuth refresh
 *    token and can kill the session for both.
 * 2. **Exit clean.** A disabled worker is not a failure. It logs one line and
 *    returns 0 so the container does not restart-loop.
 */

export interface KillSwitch {
  /** The env var that controls it. */
  readonly name: string;
  /** True only when the variable is exactly `1` (or another opted-in value). */
  readonly enabled: boolean;
  /** One line explaining the current state, for the log. */
  readonly reason: string;
  /**
   * Logs and returns false when disabled. The whole call site is
   * `if (!switch.check()) return 0;`.
   */
  check: (log?: (message: string) => void) => boolean;
}

export interface KillSwitchOptions {
  /** Log prefix, e.g. `sync`. Defaults to the env var name. */
  label?: string;
  /** Values that count as on. Defaults to `['1']`, matching upwork-crm. */
  enabledValues?: readonly string[];
  /** Injectable for tests. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export function killSwitch(name: string, options: KillSwitchOptions = {}): KillSwitch {
  const { label = name, enabledValues = ['1'], env = process.env } = options;
  const value = env[name];
  const enabled = value !== undefined && enabledValues.includes(value);
  const reason = enabled
    ? `${name}=${value} — enabled`
    : `${name}${value === undefined ? ' unset' : `=${value}`} — kill-switch on, not running`;

  return {
    name,
    enabled,
    reason,
    check(log = console.log) {
      if (!enabled) log(`[${label}] ${reason}`);
      return enabled;
    },
  };
}

/**
 * Runs `body` only when the switch is on. Resolves to `disabledExitCode`
 * (0 by default) otherwise, so a worker's `main` can be a single expression.
 */
export async function runIfEnabled(
  name: string,
  body: () => Promise<number> | number,
  options: KillSwitchOptions & { disabledExitCode?: number } = {},
): Promise<number> {
  const { disabledExitCode = 0, ...switchOptions } = options;
  const gate = killSwitch(name, switchOptions);
  if (!gate.check()) return disabledExitCode;
  return body();
}
