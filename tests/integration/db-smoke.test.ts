import { describe, it, expect } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';

describe('schema DDL', () => {
  it('creates all tables without errors', async () => {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(':memory:', 'ct');
    for (const stmt of DDL) db.exec(stmt);
    const tables = db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    const names = tables.map((r: any) => r.name);
    expect(names).toContain('ncm');
    expect(names).toContain('attribute_def');
    expect(names).toContain('ncm_attr');
    expect(names).toContain('conditional');
    expect(names).toContain('changelog');
    expect(names).toContain('project_product');
    db.close();
  });

  it('FTS index is populated by trigger', async () => {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(':memory:', 'ct');
    for (const stmt of DDL) db.exec(stmt);
    db.exec({
      sql: `INSERT INTO ncm(codigo, descricao, level) VALUES (?,?,?)`,
      bind: ['0101.21.00', 'Reprodutores de raça pura', 8]
    });
    const rows = db.selectObjects(`SELECT codigo FROM ncm_fts WHERE ncm_fts MATCH 'raca*'`);
    expect(rows).toHaveLength(1);
    db.close();
  });
});
