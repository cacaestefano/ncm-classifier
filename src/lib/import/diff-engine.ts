import type { NcmRow, ChangelogEntry } from '../types';

const NCM_FIELDS: (keyof NcmRow)[] = [
  'descricao', 'level', 'data_inicio', 'data_fim',
  'tipo_ato_ini', 'numero_ato_ini', 'ano_ato_ini'
];

export function diffNcmRows(
  oldRows: NcmRow[],
  newRows: NcmRow[],
  runId: number,
  loggedAt: string
): ChangelogEntry[] {
  const oldMap = new Map(oldRows.map(r => [r.codigo, r]));
  const newMap = new Map(newRows.map(r => [r.codigo, r]));
  const entries: ChangelogEntry[] = [];

  for (const [code, row] of newMap) {
    if (!oldMap.has(code)) {
      entries.push({
        update_run_id: runId,
        change_type: 'NCM_ADDED',
        ncm_code: code,
        attr_code: null,
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(row)
      });
    }
  }
  for (const [code, row] of oldMap) {
    if (!newMap.has(code)) {
      entries.push({
        update_run_id: runId,
        change_type: 'NCM_REMOVED',
        ncm_code: code,
        attr_code: null,
        field_changed: null,
        old_value: JSON.stringify(row),
        new_value: null
      });
    } else {
      const n = newMap.get(code)!;
      for (const f of NCM_FIELDS) {
        if (row[f] !== n[f]) {
          entries.push({
            update_run_id: runId,
            change_type: 'NCM_MODIFIED',
            ncm_code: code,
            attr_code: null,
            field_changed: f,
            old_value: String(row[f] ?? ''),
            new_value: String(n[f] ?? '')
          });
        }
      }
    }
  }
  return entries;
}
