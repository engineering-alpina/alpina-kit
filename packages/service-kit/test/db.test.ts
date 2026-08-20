import { pgTable, text } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, createLazyDb, type LazyDb } from '../src/db.js';

// A throwaway schema stands in for the owning service's tables. The kit must
// work with any of them and know none of them.
const widgets = pgTable('widgets', { id: text('id').primaryKey() });
const schema = { widgets };
type Schema = typeof schema;

const URL = 'postgres://user:pass@127.0.0.1:5432/kit_test';

// postgres-js is lazy: constructing a client opens no socket, so these tests
// need no database. Anything that would query is out of scope here.
const opened: LazyDb<Schema>[] = [];
afterEach(async () => {
  while (opened.length) await opened.pop()?.close(1);
});

describe('createDb', () => {
  it('returns a drizzle db and the raw client', async () => {
    const { db, client } = createDb(URL, { schema });
    expect(db).toBeTypeOf('object');
    expect(client).toBeTypeOf('function');
    await client.end({ timeout: 1 });
  });

  it('rejects an empty url with the caller-supplied prefix', () => {
    expect(() => createDb('', { schema, errorPrefix: 'comms-api' })).toThrow(
      /^comms-api: database url is required$/,
    );
    expect(() => createDb('', { schema })).toThrow(/^database url is required$/);
  });
});

describe('createLazyDb', () => {
  it('opens nothing until getDb is called', () => {
    const lazy = createLazyDb({ schema, env: {} });
    opened.push(lazy);
    expect(lazy.getClient()).toBeUndefined();
  });

  it('returns the same instance on every call', () => {
    const lazy = createLazyDb({ schema, env: { DATABASE_URL: URL } });
    opened.push(lazy);
    expect(lazy.getDb()).toBe(lazy.getDb());
    expect(lazy.getClient()).toBeDefined();
  });

  it('names the service and the variable when the url is missing', () => {
    const lazy = createLazyDb({ schema, env: {}, errorPrefix: 'comms-mcp' });
    opened.push(lazy);
    expect(() => lazy.getDb()).toThrow(/^comms-mcp: DATABASE_URL env var is required$/);
  });

  it('honours a custom url variable', () => {
    const lazy = createLazyDb({ schema, env: {}, urlEnv: 'INVOICING_DB_URL' });
    opened.push(lazy);
    expect(() => lazy.getDb()).toThrow(/INVOICING_DB_URL env var is required/);
  });

  it('reads the pool size from the environment and ignores garbage', () => {
    const good = createLazyDb({ schema, env: { DATABASE_URL: URL, DB_POOL_MAX: '3' } });
    opened.push(good);
    good.getDb();
    expect(good.getClient()?.options.max).toBe(3);

    const bad = createLazyDb({ schema, env: { DATABASE_URL: URL, DB_POOL_MAX: 'lots' } });
    opened.push(bad);
    bad.getDb();
    expect(bad.getClient()?.options.max).toBe(10);
  });

  it('forgets the instance after close, so the next getDb reconnects', async () => {
    const lazy = createLazyDb({ schema, env: { DATABASE_URL: URL } });
    const first = lazy.getDb();
    await lazy.close(1);
    expect(lazy.getClient()).toBeUndefined();
    const second = lazy.getDb();
    opened.push(lazy);
    expect(second).not.toBe(first);
  });
});
