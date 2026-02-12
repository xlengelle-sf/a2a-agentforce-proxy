import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if a === b, using crypto.timingSafeEqual internally.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still perform a comparison to avoid leaking length info via timing
    const dummy = Buffer.alloc(a.length, 0);
    timingSafeEqual(dummy, Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
