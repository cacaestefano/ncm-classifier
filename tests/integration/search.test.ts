import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { searchNcm } from '../../src/lib/core/search';
import { writeNcmRows } from '../../src/lib/import/ncm-writer';

const rows = [
  { codigo: '01', descricao: 'Animais vivos', level: 2, data_inicio: null, data_fim: null, tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null },
  { codigo: '0101.21.00', descricao: 'Reprodutores de raça pura', level: 8, data_inicio: null, data_fim: null, tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null },
  { codigo: '7304.19.00', descricao: 'Tubos de aço sem costura', level: 8, data_inicio: null, data_fim: null, tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null }
] as any;

async function db() {
  const s = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const d = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) d.exec(stmt);
  writeNcmRows(d, rows);
  return d;
}

describe('searchNcm', () => {
  it('returns AND-matched results ignoring diacritics', async () => {
    const d = await db();
    const r = searchNcm(d, 'raca pura');
    expect(r).toHaveLength(1);
    expect(r[0].codigo).toBe('0101.21.00');
  });

  it('classifiable-only excludes non-8-digit results', async () => {
    const d = await db();
    const all = searchNcm(d, 'animais', { classifiableOnly: false });
    const only = searchNcm(d, 'animais', { classifiableOnly: true });
    expect(all.length).toBeGreaterThan(only.length);
  });

  it('caps results at 100', async () => {
    const d = await db();
    const many = Array.from({ length: 200 }, (_, i) => ({
      codigo: `9${i.toString().padStart(3, '0')}.00.00`,
      descricao: `tubo item ${i}`,
      level: 8, data_inicio: null, data_fim: null,
      tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null
    })) as any;
    writeNcmRows(d, many);
    const r = searchNcm(d, 'tubo');
    expect(r.length).toBeLessThanOrEqual(100);
  });

  it('returns empty array on empty query', async () => {
    const d = await db();
    expect(searchNcm(d, '  ')).toEqual([]);
  });
});
