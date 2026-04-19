import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { writeNcmRows } from '../../src/lib/import/ncm-writer';
import type { NcmRow } from '../../src/lib/types';

async function freshDb() {
  const sqlite3 = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const db = new sqlite3.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

const sampleRows: NcmRow[] = [
  { codigo: '01', descricao: 'Animais', level: 2, data_inicio: '2022-01-01', data_fim: '9999-12-31', tipo_ato_ini: 'R', numero_ato_ini: '1', ano_ato_ini: '2022' },
  { codigo: '0101.21.00', descricao: 'Reprodutores', level: 8, data_inicio: '2022-04-01', data_fim: '9999-12-31', tipo_ato_ini: 'R', numero_ato_ini: '1', ano_ato_ini: '2022' }
];

describe('writeNcmRows', () => {
  it('inserts rows', async () => {
    const db = await freshDb();
    writeNcmRows(db, sampleRows);
    const cnt = db.selectValue('SELECT COUNT(*) FROM ncm');
    expect(cnt).toBe(2);
    db.close();
  });

  it('FTS populated for inserted rows', async () => {
    const db = await freshDb();
    writeNcmRows(db, sampleRows);
    const r = db.selectObjects(`SELECT codigo FROM ncm_fts WHERE ncm_fts MATCH 'reproduto*'`);
    expect(r).toHaveLength(1);
    db.close();
  });

  it('replaces prior rows (idempotent)', async () => {
    const db = await freshDb();
    writeNcmRows(db, sampleRows);
    writeNcmRows(db, [{ ...sampleRows[0], descricao: 'Changed' }]);
    const row = db.selectObjects(`SELECT descricao FROM ncm WHERE codigo='01'`);
    expect((row[0] as any).descricao).toBe('Changed');
    const cnt = db.selectValue('SELECT COUNT(*) FROM ncm');
    expect(cnt).toBe(1);
    db.close();
  });
});
