import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importAttributes } from '../../src/lib/import/attr-orchestrator';

async function freshDb() {
  const s = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

describe('importAttributes', () => {
  it('first import logs no changelog entries', async () => {
    const db = await freshDb();
    const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
    const zipped = zipSync({ 'data.json': strToU8(raw) });
    const runId = await importAttributes(db, zipped, '2026-04-18T00:00:00Z');
    expect(db.selectValue('SELECT COUNT(*) FROM changelog WHERE update_run_id=?', [runId])).toBe(0);
    expect(db.selectValue('SELECT COUNT(*) FROM attribute_def')).toBe(2);
  });

  it('second import with domain change logs it', async () => {
    const db = await freshDb();
    const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
    await importAttributes(db, zipSync({ 'data.json': strToU8(raw) }), '2026-04-18T00:00:00Z');
    const modified = raw.replace('"Aço"', '"Aço carbono"');
    const runId = await importAttributes(db, zipSync({ 'data.json': strToU8(modified) }), '2026-04-19T00:00:00Z');
    const entries = db.selectObjects(`SELECT change_type FROM changelog WHERE update_run_id=?`, [runId]);
    expect(entries.some((e: any) => e.change_type === 'DOMAIN_VALUE_MODIFIED')).toBe(true);
  });

  it('second import with identical data logs no changelog entries', async () => {
    const db = await freshDb();
    const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
    const zipped = zipSync({ 'data.json': strToU8(raw) });
    await importAttributes(db, zipped, '2026-04-18T00:00:00Z');
    const runId = await importAttributes(db, zipped, '2026-04-19T00:00:00Z');
    expect(db.selectValue('SELECT COUNT(*) FROM changelog WHERE update_run_id=?', [runId])).toBe(0);
  });
});
