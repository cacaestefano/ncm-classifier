import { extractSingleJson } from './unzip';
import { parseAttrJson, type ParsedAttrs } from './attr-import';
import { writeAttributes } from './attr-writer';
import { diffAttributes } from './attr-diff';

export async function importAttributes(db: any, zipData: Uint8Array, loggedAt: string): Promise<number> {
  const rawJson = extractSingleJson(zipData);
  const parsed = parseAttrJson(rawJson);

  const oldDefs = db.selectObjects(
    `SELECT codigo, nome, nome_apresentacao, definicao, orientacao_preenchimento,
            forma_preenchimento, data_inicio, data_fim, dominio_json, objetivos_json, orgaos_json, atributo_condicionante
     FROM attribute_def`
  );
  const oldMappings = db.selectObjects(`SELECT * FROM ncm_attr`);
  const oldCond = db.selectObjects(`SELECT * FROM conditional`);

  const firstImport = oldDefs.length === 0;
  const oldParsed: ParsedAttrs = {
    versao: 0,
    defs: oldDefs.map((r: any) => ({
      codigo: r.codigo, nome: r.nome, nome_apresentacao: r.nome_apresentacao,
      definicao: r.definicao, orientacao_preenchimento: r.orientacao_preenchimento,
      forma_preenchimento: r.forma_preenchimento, data_inicio: r.data_inicio, data_fim: r.data_fim,
      dominio: JSON.parse(r.dominio_json || '[]'),
      objetivos: JSON.parse(r.objetivos_json || '[]'),
      orgaos: JSON.parse(r.orgaos_json || '[]'),
      atributo_condicionante: !!r.atributo_condicionante
    })),
    mappings: oldMappings.map((r: any) => ({
      ncm_code: r.ncm_code, attr_code: r.attr_code, modalidade: r.modalidade,
      obrigatorio: !!r.obrigatorio, multivalorado: !!r.multivalorado,
      data_inicio: r.data_inicio, data_fim: r.data_fim
    })),
    conditionals: oldCond.map((r: any) => ({
      parent_attr_code: r.parent_attr_code, condition_desc: r.condition_desc,
      parent_operator: r.parent_operator, parent_value: r.parent_value,
      child_attr_code: r.child_attr_code, child_nome: r.child_nome,
      child_nome_apresentacao: r.child_nome_apresentacao,
      child_obrigatorio: !!r.child_obrigatorio, child_multivalorado: !!r.child_multivalorado,
      child_forma_preenchimento: r.child_forma_preenchimento,
      child_dominio: JSON.parse(r.child_dominio_json || '[]'),
      child_objetivos: JSON.parse(r.child_objetivos_json || '[]'),
      child_orgaos: JSON.parse(r.child_orgaos_json || '[]')
    }))
  };

  db.exec({
    sql: `INSERT INTO update_run(run_at, attr_versao, attr_count, mapping_count) VALUES (?,?,?,?)`,
    bind: [loggedAt, parsed.versao, parsed.defs.length, parsed.mappings.length]
  });
  const runId = db.selectValue(`SELECT last_insert_rowid()`) as number;

  writeAttributes(db, parsed);

  if (!firstImport) {
    const entries = diffAttributes(oldParsed, parsed, runId, loggedAt);
    db.transaction(() => {
      const stmt = db.prepare(
        `INSERT INTO changelog(update_run_id, change_type, ncm_code, attr_code, field_changed, old_value, new_value, logged_at)
         VALUES (?,?,?,?,?,?,?,?)`
      );
      try {
        for (const e of entries) {
          stmt.bind([e.update_run_id, e.change_type, e.ncm_code, e.attr_code, e.field_changed, e.old_value, e.new_value, loggedAt]).stepReset();
        }
      } finally { stmt.finalize(); }
    });
  }
  return runId;
}
