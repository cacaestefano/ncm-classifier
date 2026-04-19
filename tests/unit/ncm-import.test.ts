import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseNcmJson } from '../../src/lib/import/ncm-import';

describe('parseNcmJson', () => {
  const raw = readFileSync('tests/fixtures/ncm-sample.json', 'utf8');

  it('parses nomenclatura', () => {
    const { rows, meta } = parseNcmJson(raw);
    expect(rows).toHaveLength(4);
    expect(meta.ato).toBe('Resolução Gecex nº 812/2025');
    expect(meta.data_atualizacao).toBe('Vigente em 03/04/2026');
  });

  it('assigns correct level per code', () => {
    const { rows } = parseNcmJson(raw);
    const byCode = new Map(rows.map(r => [r.codigo, r]));
    expect(byCode.get('01')!.level).toBe(2);
    expect(byCode.get('01.01')!.level).toBe(4);
    expect(byCode.get('0101.21.00')!.level).toBe(8);
  });

  it('converts dates to ISO', () => {
    const { rows } = parseNcmJson(raw);
    const r = rows.find(x => x.codigo === '0101.21.00')!;
    expect(r.data_inicio).toBe('2022-04-01');
    expect(r.data_fim).toBe('9999-12-31');
  });

  it('throws on malformed input', () => {
    expect(() => parseNcmJson('{}')).toThrow();
  });
});
