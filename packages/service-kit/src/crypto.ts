import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Timing-safe string comparison that does not leak the length of either side.
 *
 * Unified from three fleet copies that all did the same job differently:
 *   - invoicing `app/lib/auth.ts` compared raw buffers and short-circuited on
 *     `a.length !== b.length`, which leaks the secret's length through timing.
 *   - comms-hub `packages/api/src/auth.ts` and
 *     `packages/api/src/routes/webhooks.ts` hashed both sides first.
 *
 * The comms-hub shape wins: SHA-256 of each side gives two fixed-width 32-byte
 * digests, so `timingSafeEqual` never throws on a length mismatch and the
 * comparison time is independent of the inputs.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** SHA-256 hex digest. Fleet convention for storing bearer keys at rest. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Reads a `Bearer <token>` Authorization header. Returns undefined when the
 * header is missing or uses another scheme.
 */
export function bearerToken(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  if (!header.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : undefined;
}
