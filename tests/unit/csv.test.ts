import { describe, it, expect } from 'vitest';
import { toCsv } from '../../src/lib/export/csv';

describe('toCsv', () => {
  it('generates headers and rows', () => {
    const out = toCsv(
      ['id', 'name'],
      [[1, 'Alice'], [2, 'Bob']]
    );
    expect(out).toBe('id,name\r\n1,Alice\r\n2,Bob');
  });

  it('quotes values containing commas', () => {
    const out = toCsv(['a'], [['x,y']]);
    expect(out).toBe('a\r\n"x,y"');
  });

  it('escapes embedded quotes', () => {
    const out = toCsv(['a'], [['say "hi"']]);
    expect(out).toBe('a\r\n"say ""hi"""');
  });

  it('quotes values containing newlines', () => {
    const out = toCsv(['a'], [['line1\nline2']]);
    expect(out).toContain('"line1\nline2"');
  });

  it('handles null and undefined as empty strings', () => {
    const out = toCsv(['a', 'b'], [[null, undefined]]);
    expect(out).toBe('a,b\r\n,');
  });
});
