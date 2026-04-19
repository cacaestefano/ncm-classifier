import type { NcmRow } from '../types';

export function writeNcmRows(db: any, rows: NcmRow[]): void {
  db.transaction(() => {
    db.exec('DELETE FROM ncm');
    const stmt = db.prepare(
      `INSERT INTO ncm(codigo, descricao, level, data_inicio, data_fim, tipo_ato_ini, numero_ato_ini, ano_ato_ini)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    try {
      for (const r of rows) {
        stmt.bind([r.codigo, r.descricao, r.level, r.data_inicio, r.data_fim,
                   r.tipo_ato_ini, r.numero_ato_ini, r.ano_ato_ini]).stepReset();
      }
    } finally { stmt.finalize(); }
  });
}
