import type { ParsedAttrs } from './attr-import';

export function writeAttributes(db: any, parsed: ParsedAttrs): void {
  db.transaction(() => {
    db.exec('DELETE FROM conditional');
    db.exec('DELETE FROM ncm_attr');
    db.exec('DELETE FROM attribute_def');

    const defStmt = db.prepare(
      `INSERT INTO attribute_def(codigo, nome, nome_apresentacao, definicao, orientacao_preenchimento,
         forma_preenchimento, data_inicio, data_fim, dominio_json, objetivos_json, orgaos_json, atributo_condicionante)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    try {
      for (const d of parsed.defs) {
        defStmt.bind([
          d.codigo, d.nome, d.nome_apresentacao, d.definicao, d.orientacao_preenchimento,
          d.forma_preenchimento, d.data_inicio, d.data_fim,
          JSON.stringify(d.dominio), JSON.stringify(d.objetivos), JSON.stringify(d.orgaos),
          d.atributo_condicionante ? 1 : 0
        ]).stepReset();
      }
    } finally { defStmt.finalize(); }

    const mapStmt = db.prepare(
      `INSERT INTO ncm_attr(ncm_code, attr_code, modalidade, obrigatorio, multivalorado, data_inicio, data_fim)
       VALUES (?,?,?,?,?,?,?)`
    );
    try {
      for (const m of parsed.mappings) {
        mapStmt.bind([m.ncm_code, m.attr_code, m.modalidade,
                      m.obrigatorio ? 1 : 0, m.multivalorado ? 1 : 0,
                      m.data_inicio, m.data_fim]).stepReset();
      }
    } finally { mapStmt.finalize(); }

    const condStmt = db.prepare(
      `INSERT INTO conditional(parent_attr_code, condition_desc, parent_operator, parent_value,
         child_attr_code, child_nome, child_nome_apresentacao, child_obrigatorio, child_multivalorado,
         child_forma_preenchimento, child_dominio_json, child_objetivos_json, child_orgaos_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    try {
      for (const c of parsed.conditionals) {
        condStmt.bind([
          c.parent_attr_code, c.condition_desc, c.parent_operator, c.parent_value,
          c.child_attr_code, c.child_nome, c.child_nome_apresentacao,
          c.child_obrigatorio ? 1 : 0, c.child_multivalorado ? 1 : 0,
          c.child_forma_preenchimento,
          JSON.stringify(c.child_dominio),
          JSON.stringify(c.child_objetivos),
          JSON.stringify(c.child_orgaos)
        ]).stepReset();
      }
    } finally { condStmt.finalize(); }
  });
}
