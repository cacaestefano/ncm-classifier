import type { Modalidade } from '../types';

export interface ExpansionOptions {
  modalidades: Modalidade[];
  mandatoryOnly: boolean;
  excludedAttrs: string[];
  today: string; // ISO yyyy-mm-dd
}

function serializeDomain(dominioJson: string): string {
  try {
    const arr = JSON.parse(dominioJson) as { codigo: string; descricao: string }[];
    return arr.map(d => `${d.codigo} - ${d.descricao}`).join('; ');
  } catch {
    return '';
  }
}

function serializeOrgaos(json: string): string {
  try { return (JSON.parse(json) as string[]).join('; '); } catch { return ''; }
}

function serializeObjetivos(json: string): string {
  try { return (JSON.parse(json) as { codigo: string; descricao: string }[]).map(o => o.descricao).join('; '); } catch { return ''; }
}

export function expandAttributesForProduct(db: any, productId: number, opts: ExpansionOptions): void {
  const product = db.selectObjects(
    `SELECT ncm_code FROM project_product WHERE id = ?`, [productId]
  )[0] as { ncm_code: string | null } | undefined;
  if (!product || !product.ncm_code) return;

  db.transaction(() => {
    db.exec({ sql: `DELETE FROM project_attr_row WHERE product_id = ?`, bind: [productId] });

    const modalityPlaceholders = opts.modalidades.map(() => '?').join(',');
    const excludedPlaceholders = opts.excludedAttrs.length ? opts.excludedAttrs.map(() => '?').join(',') : "''";

    const sql = `
      SELECT d.codigo AS attr_code,
             d.nome_apresentacao AS attr_name,
             m.obrigatorio, m.multivalorado,
             d.forma_preenchimento,
             d.dominio_json, d.orgaos_json, d.objetivos_json
      FROM ncm_attr m
      JOIN attribute_def d ON d.codigo = m.attr_code
      WHERE m.ncm_code = ?
        AND m.modalidade IN (${modalityPlaceholders})
        ${opts.mandatoryOnly ? 'AND m.obrigatorio = 1' : ''}
        AND (m.data_fim = '' OR m.data_fim = '9999-12-31' OR m.data_fim >= ?)
        AND (d.data_fim = '' OR d.data_fim = '9999-12-31' OR d.data_fim >= ?)
        ${opts.excludedAttrs.length ? `AND d.codigo NOT IN (${excludedPlaceholders})` : ''}
      ORDER BY m.obrigatorio DESC, d.codigo
    `;

    const params: unknown[] = [product.ncm_code, ...opts.modalidades, opts.today, opts.today, ...opts.excludedAttrs];
    const attrs = db.selectObjects(sql, params) as any[];

    if (attrs.length === 0) {
      db.exec({
        sql: `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
                attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
                attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
              VALUES (?,1,NULL,NULL,'','','','','','','','','empty_ncm')`,
        bind: [productId]
      });
      return;
    }

    const insert = db.prepare(
      `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
         attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
         attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'base')`
    );
    try {
      let counter = 1;
      for (const a of attrs) {
        insert.bind([
          productId, counter++, a.attr_code, a.attr_name,
          a.obrigatorio ? 'Yes' : 'No',
          a.multivalorado ? 'Yes' : 'No',
          a.forma_preenchimento,
          serializeDomain(a.dominio_json),
          serializeOrgaos(a.orgaos_json),
          serializeObjetivos(a.objetivos_json),
          '',  // attr_conditional_on (base rows)
          ''   // attr_value
        ]).stepReset();
      }
    } finally { insert.finalize(); }
  });
}
