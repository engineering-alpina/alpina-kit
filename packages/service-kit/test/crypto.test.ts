import { describe, expect, it } from 'vitest';
import { bearerToken, safeEqual, sha256Hex } from '../src/crypto.js';

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('s3cret', 's3cret')).toBe(true);
  });

  it('rejects different strings of the same length', () => {
    expect(safeEqual('s3cret', 's3cres')).toBe(false);
  });

  it('does not leak length: unequal lengths compare without throwing', () => {
    // node's timingSafeEqual throws on buffers of different byte length. The
    // naive `a.length === b.length && timingSafeEqual(...)` guard avoids the
    // throw but answers instantly for a wrong-length candidate, which tells an
    // attacker the secret's length. Hashing both sides first removes the signal.
    expect(() => safeEqual('a', 'a-much-longer-candidate-value')).not.toThrow();
    expect(safeEqual('a', 'a-much-longer-candidate-value')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('compares fixed-width digests regardless of input size', () => {
    // Same property stated structurally: whatever goes in, 32 bytes come out,
    // so the comparison itself sees the same amount of data every time.
    expect(sha256Hex('a')).toHaveLength(64);
    expect(sha256Hex('a'.repeat(10_000))).toHaveLength(64);
  });

  it('handles multi-byte characters', () => {
    expect(safeEqual('パスワード', 'パスワード')).toBe(true);
    expect(safeEqual('パスワード', 'パスワート')).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('matches `shasum -a 256`, so hashes computed at the shell verify here', () => {
    expect(sha256Hex('alpina')).toBe(
      'dded9baf7ebfa56013c09afea41fd31f1e1ebd600f67eea824b3f7d00f7f6ab6',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('bearerToken', () => {
  it('extracts the token', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
  });

  it('ignores other schemes and empty values', () => {
    expect(bearerToken('Basic abc123')).toBeUndefined();
    expect(bearerToken('Bearer ')).toBeUndefined();
    expect(bearerToken(null)).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
  });
});
