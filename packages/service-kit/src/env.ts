import { z } from 'zod';

/**
 * Fail-fast env parsing. Today every service reads `process.env.FOO` inline and
 * discovers a missing var when the request that needs it arrives, usually in
 * production. `parseEnv` moves that discovery to boot and prints every problem
 * at once instead of one per restart.
 */

export class EnvError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = 'EnvError';
    this.issues = issues;
  }
}

export interface ParseEnvOptions {
  /** Named in the error, e.g. `sync-worker`. */
  service?: string;
  /** Defaults to `process.env`. */
  source?: Record<string, string | undefined>;
}

/** Turns a zod issue tree into one readable line per variable. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    return `  ${name}: ${issue.message}`;
  });
}

/**
 * Parses the environment against a zod object schema.
 *
 * ```ts
 * const env = parseEnv(
 *   z.object({
 *     DATABASE_URL: z.string().url(),
 *     PORT: z.coerce.number().default(4417),
 *   }),
 *   { service: 'invoicing' },
 * );
 * ```
 *
 * Throws `EnvError` listing every failing variable. Never logs the values: an
 * env dump in a crash log is how secrets end up in Loki.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  options: ParseEnvOptions = {},
): z.infer<TSchema> {
  const source = options.source ?? process.env;
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const issues = formatIssues(result.error);
  const who = options.service ? `${options.service}: ` : '';
  throw new EnvError(
    `${who}invalid environment (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n${issues.join('\n')}`,
    issues,
  );
}

/**
 * Same parse, no throw. For call sites that want to render a configuration
 * error rather than crash the process (an admin page, a health endpoint).
 */
export function safeParseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  options: ParseEnvOptions = {},
): { ok: true; env: z.infer<TSchema> } | { ok: false; issues: string[] } {
  const source = options.source ?? process.env;
  const result = schema.safeParse(source);
  if (result.success) return { ok: true, env: result.data };
  return { ok: false, issues: formatIssues(result.error) };
}

/** `1`, `true`, `yes`, `on` are true; everything else, including unset, false. */
export const booleanFlag = z
  .string()
  .optional()
  .transform((v) => ['1', 'true', 'yes', 'on'].includes((v ?? '').toLowerCase()));

/** Comma-separated list, trimmed, empties dropped. The fleet allowlist shape. */
export const commaList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
