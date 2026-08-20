import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { booleanFlag, commaList, EnvError, parseEnv, safeParseEnv } from '../src/env.js';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4417),
  SSO_ALLOWED_EMAILS: commaList,
  SYNC_ENABLED: booleanFlag,
});

describe('parseEnv', () => {
  it('returns typed values and applies defaults', () => {
    const env = parseEnv(schema, {
      source: { DATABASE_URL: 'postgres://localhost/x' },
    });
    expect(env.DATABASE_URL).toBe('postgres://localhost/x');
    expect(env.PORT).toBe(4417);
    expect(env.SSO_ALLOWED_EMAILS).toEqual([]);
    expect(env.SYNC_ENABLED).toBe(false);
  });

  it('coerces and splits', () => {
    const env = parseEnv(schema, {
      source: {
        DATABASE_URL: 'postgres://localhost/x',
        PORT: '4418',
        SSO_ALLOWED_EMAILS: ' a@x.com , b@x.com ,',
        SYNC_ENABLED: '1',
      },
    });
    expect(env.PORT).toBe(4418);
    expect(env.SSO_ALLOWED_EMAILS).toEqual(['a@x.com', 'b@x.com']);
    expect(env.SYNC_ENABLED).toBe(true);
  });

  it('throws EnvError naming the service and every failing variable', () => {
    let caught: unknown;
    try {
      parseEnv(schema, { service: 'invoicing', source: { PORT: 'not-a-number' } });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvError);
    const error = caught as EnvError;
    expect(error.message).toContain('invoicing:');
    expect(error.message).toContain('DATABASE_URL');
    expect(error.message).toContain('PORT');
    expect(error.issues).toHaveLength(2);
  });

  it('never echoes the values it rejected', () => {
    let message = '';
    try {
      parseEnv(z.object({ TOKEN: z.string().min(40) }), {
        source: { TOKEN: 'short-but-still-a-secret' },
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('TOKEN');
    expect(message).not.toContain('short-but-still-a-secret');
  });
});

describe('safeParseEnv', () => {
  it('reports issues instead of throwing', () => {
    const result = safeParseEnv(schema, { source: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join('\n')).toContain('DATABASE_URL');
  });

  it('returns the parsed env on success', () => {
    const result = safeParseEnv(schema, { source: { DATABASE_URL: 'postgres://x/y' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.PORT).toBe(4417);
  });
});

describe('booleanFlag', () => {
  it('accepts the usual truthy spellings, nothing else', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(booleanFlag.parse(value)).toBe(true);
    }
    for (const value of ['0', 'false', '', 'maybe', undefined]) {
      expect(booleanFlag.parse(value)).toBe(false);
    }
  });
});
