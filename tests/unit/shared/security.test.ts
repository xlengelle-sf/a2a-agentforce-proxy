import { describe, it, expect } from 'vitest';
import { safeCompare } from '../../../src/shared/security.js';

describe('safeCompare', () => {
  it('should return true for equal strings', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
  });

  it('should return false for different strings of same length', () => {
    expect(safeCompare('abc123', 'abc456')).toBe(false);
  });

  it('should return false for different length strings', () => {
    expect(safeCompare('short', 'much-longer-string')).toBe(false);
  });

  it('should return true for empty strings', () => {
    expect(safeCompare('', '')).toBe(true);
  });

  it('should return false for empty vs non-empty', () => {
    expect(safeCompare('', 'something')).toBe(false);
  });

  it('should handle long API key-like strings', () => {
    const key = 'sk-a2a-proxy-1234567890abcdef1234567890abcdef';
    expect(safeCompare(key, key)).toBe(true);
    expect(safeCompare(key, key.replace('a', 'b'))).toBe(false);
  });
});
