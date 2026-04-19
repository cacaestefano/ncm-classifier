import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importNcm } from '../../src/lib/import/ncm-orchestrator';

async function freshDb() {
  const sqlite3 = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const db = new sqlite3.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

describe('importNcm', () => {
  const raw = readFileSync('tests/fixtures/ncm-sample.json', 'utf8');

  it('first import creates no changelog entries', async () => {
    const db = await freshDb();
    const runId = await importNcm(db, raw, '2026-04-18T00:00:00Z');
    const clog = db.selectValue('SELECT COUNT(*) FROM changelog WHERE update_run_id = ?', [runId]);
    expect(clog).toBe(0);
    const ncm = db.selectValue('SELECT COUNT(*) FROM ncm');
    expect(ncm).toBe(4);
  });

  it('second import with changes logs diffs', async () => {
    const db = await freshDb();
    await importNcm(db, raw, '2026-04-18T00:00:00Z');
    const modified = raw.replace('Reprodutores de raça pura', 'Reprodutores de raça MIXED');
    const runId = await importNcm(db, modified, '2026-04-19T00:00:00Z');
    const entries = db.selectObjects(`SELECT change_type, field_changed FROM changelog WHERE update_run_id = ?`, [runId]);
    expect(entries.length).toBeGreaterThan(0);
    expect((entries[0] as any).change_type).toBe('NCM_MODIFIED');
  });
});
