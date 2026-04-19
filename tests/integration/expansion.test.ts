import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importAttributes } from '../../src/lib/import/attr-orchestrator';
import { expandAttributesForProduct } from '../../src/lib/core/expansion';

async function seed() {
  const s = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
  await importAttributes(db, zipSync({ 'data.json': strToU8(raw) }), '2026-04-18T00:00:00Z');
  db.exec({
    sql: `INSERT INTO project_product(id, unique_id, short_desc, long_desc, ncm_code, ncm_description)
          VALUES (1, 'P1', 'test', 'test long', '0101.21.00', 'Reprodutores de raça pura')`
  });
  return db;
}

describe('expandAttributesForProduct', () => {
  it('creates base rows for each mapped attribute', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    const rows = db.selectObjects(`SELECT attr_code, attr_name, attr_fill_type, source FROM project_attr_row WHERE product_id=1 ORDER BY attr_counter`);
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.source === 'base')).toBe(true);
    expect((rows[0] as any).attr_name).toBe('Material de fabricação');
  });

  it('serializes LISTA_ESTATICA domain', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    const r = db.selectObjects(`SELECT attr_domain_values FROM project_attr_row WHERE attr_code='ATT_9332'`)[0] as any;
    expect(r.attr_domain_values).toBe('01 - Aço; 02 - Alumínio');
  });

  it('mandatoryOnly=true filters out non-mandatory', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: true, excludedAttrs: [], today: '2026-04-18' });
    const codes = (db.selectObjects(`SELECT attr_code FROM project_attr_row WHERE product_id=1`) as any[]).map(r => r.attr_code);
    expect(codes).toEqual(['ATT_9332']);
  });

  it('excludedAttrs removes those codes', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: ['ATT_9332'], today: '2026-04-18' });
    const codes = (db.selectObjects(`SELECT attr_code FROM project_attr_row WHERE product_id=1`) as any[]).map(r => r.attr_code);
    expect(codes).toEqual(['ATT_12960']);
  });

  it('produces empty_ncm placeholder when no matches', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_product SET ncm_code='9999.99.99' WHERE id=1` });
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    const rows = db.selectObjects(`SELECT source, attr_code FROM project_attr_row WHERE product_id=1`) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('empty_ncm');
    expect(rows[0].attr_code).toBeNull();
  });

  it('is idempotent (replaces prior rows for the product)', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    expect(db.selectValue(`SELECT COUNT(*) FROM project_attr_row WHERE product_id=1`)).toBe(2);
  });
});
