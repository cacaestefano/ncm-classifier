import { describe, it, expect } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { collectOutputRows } from '../../src/lib/export/exporter';

describe('collectOutputRows', () => {
  it('joins product + attr rows in stacked format', async () => {
    const s = await (sqlite3InitModule as any)({ print: () => {}, printErr: () => {} });
    const db = new s.oo1.DB(':memory:', 'ct');
    for (const stmt of DDL) db.exec(stmt);
    db.exec({
      sql: `INSERT INTO project_product(id, unique_id, short_desc, long_desc, ncm_code, ncm_description)
            VALUES (1, 'P1', 's', 'l', '0101.21.00', 'R')`
    });
    db.exec({
      sql: `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
              attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
              attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
            VALUES (1, 1, 'ATT_1', 'Material', 'Yes', 'No', 'LISTA_ESTATICA', '01 - A', 'INMETRO', 'Produto', '', '', 'base')`
    });
    const rows = collectOutputRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].unique_id).toBe('P1');
    expect(rows[0].attr_code).toBe('ATT_1');
    expect(rows[0].ncm_code).toBe('0101.21.00');
  });
});
