import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { parseAttrJson } from '../../src/lib/import/attr-import';
import { writeAttributes } from '../../src/lib/import/attr-writer';

async function freshDb() {
  const s = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

describe('writeAttributes', () => {
  it('inserts defs, mappings, conditionals', async () => {
    const db = await freshDb();
    const parsed = parseAttrJson(readFileSync('tests/fixtures/attrs-sample.json', 'utf8'));
    writeAttributes(db, parsed);
    expect(db.selectValue('SELECT COUNT(*) FROM attribute_def')).toBe(2);
    expect(db.selectValue('SELECT COUNT(*) FROM ncm_attr')).toBe(2);
    expect(db.selectValue('SELECT COUNT(*) FROM conditional')).toBe(1);
  });

  it('stores domain as JSON', async () => {
    const db = await freshDb();
    const parsed = parseAttrJson(readFileSync('tests/fixtures/attrs-sample.json', 'utf8'));
    writeAttributes(db, parsed);
    const row = db.selectObjects(`SELECT dominio_json FROM attribute_def WHERE codigo='ATT_9332'`)[0] as any;
    const dom = JSON.parse(row.dominio_json);
    expect(dom).toHaveLength(2);
  });

  it('is idempotent', async () => {
    const db = await freshDb();
    const parsed = parseAttrJson(readFileSync('tests/fixtures/attrs-sample.json', 'utf8'));
    writeAttributes(db, parsed);
    writeAttributes(db, parsed);
    expect(db.selectValue('SELECT COUNT(*) FROM attribute_def')).toBe(2);
    expect(db.selectValue('SELECT COUNT(*) FROM conditional')).toBe(1);
  });
});
