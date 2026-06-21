import type { ConditionOperator } from '../types';

function conditionMatches(op: ConditionOperator, triggerValue: string, actualValue: string): boolean {
  if (!actualValue) return false;
  switch (op) {
    case 'EQ': return actualValue === triggerValue;
    case 'NEQ': return actualValue !== triggerValue;
    case 'IN': return triggerValue.split(',').map(s => s.trim()).includes(actualValue);
    case 'FILLED': return actualValue.trim().length > 0;
    case 'UNKNOWN':
    default:
      return false;
  }
}

function serializeDomain(dominioJson: string): string {
  try {
    const arr = JSON.parse(dominioJson) as { codigo: string; descricao: string }[];
    return arr.map(d => `${d.codigo} - ${d.descricao}`).join('; ');
  } catch { return ''; }
}
function serializeOrgaos(j: string) { try { return (JSON.parse(j) as string[]).join('; '); } catch { return ''; } }
function serializeObjetivos(j: string) { try { return (JSON.parse(j) as {codigo:string;descricao:string}[]).map(o => o.descricao).join('; '); } catch { return ''; } }

const MAX_PASSES = 8;

export function expandConditionalsForProduct(db: any, productId: number): void {
  db.transaction(() => {
    const snapshot = db.selectObjects(
      `SELECT attr_code, attr_value FROM project_attr_row
       WHERE product_id = ? AND source = 'conditional' AND COALESCE(attr_value,'') <> ''`,
      [productId]
    ) as { attr_code: string; attr_value: string }[];
    const savedValues = new Map<string, string>();
    for (const s of snapshot) savedValues.set(s.attr_code, s.attr_value);

    db.exec({ sql: `DELETE FROM project_attr_row WHERE product_id = ? AND source = 'conditional'`, bind: [productId] });

    const insert = db.prepare(
      `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
         attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
         attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'conditional')`
    );

    try {
      let tempCounter = 100000;

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const existing = db.selectObjects(
          `SELECT attr_code FROM project_attr_row WHERE product_id = ?`,
          [productId]
        ) as { attr_code: string }[];
        const have = new Set(existing.map(r => r.attr_code));

        const parents = db.selectObjects(
          `SELECT r.id, r.attr_counter, r.attr_code, r.attr_value
           FROM project_attr_row r
           JOIN attribute_def d ON d.codigo = r.attr_code
           WHERE r.product_id = ?
             AND d.atributo_condicionante = 1
             AND COALESCE(r.attr_value,'') <> ''`,
          [productId]
        ) as any[];

        let added = 0;
        for (const p of parents) {
          const rules = db.selectObjects(
            `SELECT * FROM conditional WHERE parent_attr_code = ?`,
            [p.attr_code]
          ) as any[];
          for (const r of rules) {
            if (have.has(r.child_attr_code)) continue;
            if (!conditionMatches(r.parent_operator, r.parent_value, p.attr_value)) continue;
            const savedValue = savedValues.get(r.child_attr_code) ?? '';
            insert.bind([
              productId,
              p.attr_counter * 1000 + (tempCounter++ - 100000) + 1,
              r.child_attr_code,
              r.child_nome_apresentacao || r.child_nome,
              r.child_obrigatorio ? 'Yes' : 'No',
              r.child_multivalorado ? 'Yes' : 'No',
              r.child_forma_preenchimento,
              serializeDomain(r.child_dominio_json),
              serializeOrgaos(r.child_orgaos_json),
              serializeObjetivos(r.child_objetivos_json),
              `${r.parent_attr_code} = ${r.parent_value}`,
              savedValue
            ]).stepReset();
            have.add(r.child_attr_code);
            added++;
          }
        }
        if (added === 0) break;
      }
    } finally { insert.finalize(); }

    const ordered = db.selectObjects(
      `SELECT id FROM project_attr_row
       WHERE product_id = ?
       ORDER BY
         CASE WHEN source='conditional' THEN attr_counter/1000 ELSE attr_counter END,
         CASE WHEN source='conditional' THEN 1 ELSE 0 END,
         id`,
      [productId]
    ) as any[];

    const upd = db.prepare(`UPDATE project_attr_row SET attr_counter = ? WHERE id = ?`);
    try {
      let i = 1;
      for (const row of ordered) {
        upd.bind([i++, row.id]).stepReset();
      }
    } finally { upd.finalize(); }
  });
}
