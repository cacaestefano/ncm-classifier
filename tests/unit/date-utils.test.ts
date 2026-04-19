import { describe, it, expect } from 'vitest';
import { brDateToIso, isoToBrDate, isExpired } from '../../src/lib/import/date-utils';

describe('brDateToIso', () => {
  it('converts dd/mm/yyyy to yyyy-mm-dd', () => {
    expect(brDateToIso('01/04/2022')).toBe('2022-04-01');
  });
  it('handles sentinel date 31/12/9999', () => {
    expect(brDateToIso('31/12/9999')).toBe('9999-12-31');
  });
  it('returns null for empty input', () => {
    expect(brDateToIso('')).toBeNull();
    expect(brDateToIso(null as any)).toBeNull();
  });
  it('throws on malformed input', () => {
    expect(() => brDateToIso('2022-04-01')).toThrow();
    expect(() => brDateToIso('not a date')).toThrow();
  });
});

describe('isExpired', () => {
  it('treats 9999 dates as never-expiring', () => {
    expect(isExpired('9999-12-31', '2026-04-18')).toBe(false);
  });
  it('returns true for dates before today', () => {
    expect(isExpired('2020-01-01', '2026-04-18')).toBe(true);
  });
  it('returns false for today', () => {
    expect(isExpired('2026-04-18', '2026-04-18')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isExpired('', '2026-04-18')).toBe(false);
  });
});
