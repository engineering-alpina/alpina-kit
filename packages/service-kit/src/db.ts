import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * Drizzle + postgres-js wiring, unified from two near-identical copies:
 * invoicing `packages/db/src/client.ts` and comms-hub
 * `packages/db/src/client.ts`. They differed in exactly one place, the error
 * message ("url is required" vs "DATABASE_URL is required"), so the kit takes
 * the message prefix as a parameter.
 *
 * The schema stays with the owning service: a kit package must never know a
 * service's tables, so the caller passes its own drizzle schema in.
 */

type PostgresOptions = Parameters<typeof postgres>[1];
type PostgresClient = ReturnType<typeof postgres>;

export interface Database<TSchema extends Record<string, unknown>> {
  db: PostgresJsDatabase<TSchema>;
  client: PostgresClient;
}

export interface CreateDbOptions<TSchema extends Record<string, unknown>> {
  /** The owning service's drizzle schema object. */
  schema: TSchema;
  /** Prefixes the "missing url" error, e.g. `comms-api`. */
  errorPrefix?: string;
  /** Passed straight through to postgres-js (`max`, `idle_timeout`, ...). */
  client?: PostgresOptions;
}

export function createDb<TSchema extends Record<string, unknown>>(
  url: string,
  options: CreateDbOptions<TSchema>,
): Database<TSchema> {
  if (!url) {
    const prefix = options.errorPrefix ? `${options.errorPrefix}: ` : '';
    throw new Error(`${prefix}database url is required`);
  }
  const client = postgres(url, options.client);
  const db = drizzle(client, { schema: options.schema });
  return { db, client };
}

export interface LazyDbOptions<
  TSchema extends Record<string, unknown>,
> extends CreateDbOptions<TSchema> {
  /** Env var holding the connection string. Defaults to `DATABASE_URL`. */
  urlEnv?: string;
  /** Env var holding the pool size. Defaults to `DB_POOL_MAX`. */
  poolMaxEnv?: string;
  /** Pool size when the env var is unset. Defaults to 10. */
  defaultPoolMax?: number;
  /** Injectable for tests. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

export interface LazyDb<TSchema extends Record<string, unknown>> {
  /** Opens the connection on first call, then returns the same instance. */
  getDb: () => PostgresJsDatabase<TSchema>;
  /** The underlying postgres-js client, or undefined before the first getDb(). */
  getClient: () => PostgresClient | undefined;
  /** Closes the pool and forgets the instance. Mostly for tests and workers. */
  close: (timeoutSeconds?: number) => Promise<void>;
}

/**
 * The lazy singleton every app rebuilt by hand: invoicing `app/lib/db.ts`,
 * comms-hub `packages/api/src/db-context.ts` and `packages/mcp/src/db-context.ts`
 * (the last two byte-identical apart from their error prefix).
 *
 * Lazy on purpose: a module-level connection would open a socket during a
 * Next build and during any test that only imports the module.
 */
export function createLazyDb<TSchema extends Record<string, unknown>>(
  options: LazyDbOptions<TSchema>,
): LazyDb<TSchema> {
  const {
    urlEnv = 'DATABASE_URL',
    poolMaxEnv = 'DB_POOL_MAX',
    defaultPoolMax = 10,
    errorPrefix,
  } = options;
  let opened: Database<TSchema> | undefined;

  function getDb(): PostgresJsDatabase<TSchema> {
    if (opened) return opened.db;
    const env = options.env ?? process.env;
    const url = env[urlEnv];
    if (!url) {
      const prefix = errorPrefix ? `${errorPrefix}: ` : '';
      throw new Error(`${prefix}${urlEnv} env var is required`);
    }
    const rawMax = env[poolMaxEnv];
    const parsedMax = rawMax === undefined ? defaultPoolMax : Number(rawMax);
    const max = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : defaultPoolMax;
    opened = createDb(url, {
      schema: options.schema,
      ...(errorPrefix === undefined ? {} : { errorPrefix }),
      client: { max, ...(options.client ?? {}) },
    });
    return opened.db;
  }

  return {
    getDb,
    getClient: () => opened?.client,
    close: async (timeoutSeconds = 5) => {
      const current = opened;
      opened = undefined;
      if (current) await current.client.end({ timeout: timeoutSeconds });
    },
  };
}
