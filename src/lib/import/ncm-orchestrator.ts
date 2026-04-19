import { parseNcmJson } from './ncm-import';
import { writeNcmRows } from './ncm-writer';
import { diffNcmRows } from './diff-engine';
import type { NcmRow } from '../types';

export async function importNcm(db: any, rawJson: string, loggedAt: string): Promise<number> {
  const { rows, meta } = parseNcmJson(rawJson);
  const existingRows: NcmRow[] = db.selectObjects(
    `SELECT codigo, descricao, level, data_inicio, data_fim, tipo_ato_ini, numero_ato_ini, ano_ato_ini FROM ncm`
  );
  const firstImport = existingRows.length === 0;

  db.exec({
    sql: `INSERT INTO update_run(run_at, ncm_source_ato, ncm_data_atualizacao, ncm_count)
          VALUES (?,?,?,?)`,
    bind: [loggedAt, meta.ato, meta.data_atualizacao, rows.length]
  });
  const runId = db.selectValue(`SELECT last_insert_rowid()`) as number;

  writeNcmRows(db, rows);

  if (!firstImport) {
    const entries = diffNcmRows(existingRows, rows, runId, loggedAt);
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
