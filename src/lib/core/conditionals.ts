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

export function expandConditionalsForProduct(db: any, productId: number): void {
  db.transaction(() => {
    db.exec({ sql: `DELETE FROM project_attr_row WHERE product_id = ? AND source = 'conditional'`, bind: [productId] });

    const parents = db.selectObjects(
      `SELECT r.id, r.attr_counter, r.attr_code, r.attr_value
       FROM project_attr_row r
       JOIN attribute_def d ON d.codigo = r.attr_code
       WHERE r.product_id = ?
         AND r.source = 'base'
         AND d.atributo_condicionante = 1
         AND COALESCE(r.attr_value,'') <> ''`,
      [productId]
    ) as any[];

    interface NewChild {
      afterCounter: number;
      attr_code: string;
      attr_name: string;
      attr_mandatory: string;
      attr_multivalued: string;
      attr_fill_type: string;
      attr_domain_values: string;
      attr_regulatory_body: string;
      attr_objective: string;
      attr_conditional_on: string;
    }

    const newChildren: NewChild[] = [];
    for (const p of parents) {
      const rules = db.selectObjects(
        `SELECT * FROM conditional WHERE parent_attr_code = ?`,
        [p.attr_code]
      ) as any[];
      for (const r of rules) {
        if (conditionMatches(r.parent_operator, r.parent_value, p.attr_value)) {
          newChildren.push({
            afterCounter: p.attr_counter,
            attr_code: r.child_attr_code,
            attr_name: r.child_nome_apresentacao || r.child_nome,
            attr_mandatory: r.child_obrigatorio ? 'Yes' : 'No',
            attr_multivalued: r.child_multivalorado ? 'Yes' : 'No',
            attr_fill_type: r.child_forma_preenchimento,
            attr_domain_values: serializeDomain(r.child_dominio_json),
            attr_regulatory_body: serializeOrgaos(r.child_orgaos_json),
            attr_objective: serializeObjetivos(r.child_objetivos_json),
            attr_conditional_on: `${r.parent_attr_code} = ${r.parent_value}`
          });
        }
      }
    }

    const insert = db.prepare(
      `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
         attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
         attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'conditional')`
    );
    try {
      let tempCounter = 100000;
      for (const c of newChildren) {
        insert.bind([
          productId, c.afterCounter * 1000 + (tempCounter++ - 100000) + 1,
          c.attr_code, c.attr_name,
          c.attr_mandatory, c.attr_multivalued, c.attr_fill_type,
          c.attr_domain_values, c.attr_regulatory_body, c.attr_objective,
          c.attr_conditional_on
        ]).stepReset();
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
