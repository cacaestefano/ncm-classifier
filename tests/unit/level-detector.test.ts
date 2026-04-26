import { describe, it, expect } from 'vitest';
import { detectLevel, isClassifiable } from '../../src/lib/import/level-detector';

describe('detectLevel', () => {
  it('returns 2 for chapter codes', () => {
    expect(detectLevel('01')).toBe(2);
  });
  it('returns 4 for heading codes', () => {
    expect(detectLevel('01.01')).toBe(4);
  });
  it('returns 5 for subheading codes', () => {
    expect(detectLevel('0101.2')).toBe(5);
  });
  it('returns 6 for HS subheading codes', () => {
    expect(detectLevel('0102.21')).toBe(6);
  });
  it('returns 7 for 7-digit codes', () => {
    expect(detectLevel('0102.211')).toBe(7);
  });
  it('returns 8 for item codes', () => {
    expect(detectLevel('0101.21.00')).toBe(8);
  });
  it('returns 8 for alternate 8-digit formatting', () => {
    expect(detectLevel('0101.2100')).toBe(8);
  });
});

describe('isClassifiable', () => {
  it('accepts 8-digit codes', () => {
    expect(isClassifiable('0101.21.00')).toBe(true);
  });
  it('rejects non-8-digit codes', () => {
    expect(isClassifiable('01.01')).toBe(false);
    expect(isClassifiable('01')).toBe(false);
    expect(isClassifiable('0101.2')).toBe(false);
  });
});
