import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importAttributes } from '../../src/lib/import/attr-orchestrator';
import { expandAttributesForProduct } from '../../src/lib/core/expansion';
import { expandConditionalsForProduct } from '../../src/lib/core/conditionals';

async function seed() {
  const s = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
  await importAttributes(db, zipSync({ 'data.json': strToU8(raw) }), '2026-04-18T00:00:00Z');
  db.exec({
    sql: `INSERT INTO project_product(id, unique_id, short_desc, long_desc, ncm_code, ncm_description)
          VALUES (1, 'P1', 't', 't', '0101.21.00', 'R')`
  });
  expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
  return db;
}

describe('expandConditionalsForProduct', () => {
  it('inserts child rows when parent value matches EQ rule', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='999' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    const rows = db.selectObjects(`SELECT attr_code, source, attr_conditional_on FROM project_attr_row WHERE product_id=1 ORDER BY attr_counter`) as any[];
    const child = rows.find(r => r.attr_code === 'ATT_9999');
    expect(child).toBeDefined();
    expect(child.source).toBe('conditional');
    expect(child.attr_conditional_on).toBe('ATT_9332 = 999');
  });

  it('does not insert children when parent value does not match', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='01' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    const codes = (db.selectObjects(`SELECT attr_code FROM project_attr_row WHERE product_id=1`) as any[]).map(r => r.attr_code);
    expect(codes).not.toContain('ATT_9999');
  });

  it('re-runs safely (removes stale conditional rows)', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='999' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    expandConditionalsForProduct(db, 1);
    const cnt = db.selectValue(`SELECT COUNT(*) FROM project_attr_row WHERE product_id=1 AND attr_code='ATT_9999'`);
    expect(cnt).toBe(1);
  });

  it('renumbers attr_counter sequentially', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='999' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    const counters = (db.selectObjects(`SELECT attr_counter FROM project_attr_row WHERE product_id=1 ORDER BY attr_counter`) as any[])
      .map(r => r.attr_counter);
    expect(counters).toEqual([1, 2, 3]);
  });
});
