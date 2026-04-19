import { describe, it, expect } from 'vitest';
import { diffNcmRows } from '../../src/lib/import/diff-engine';
import type { NcmRow } from '../../src/lib/types';

const base = (codigo: string, over: Partial<NcmRow> = {}): NcmRow => ({
  codigo, descricao: `desc ${codigo}`, level: 8,
  data_inicio: '2022-01-01', data_fim: '9999-12-31',
  tipo_ato_ini: 'R', numero_ato_ini: '1', ano_ato_ini: '2022',
  ...over
});

describe('diffNcmRows', () => {
  it('detects ADDED', () => {
    const changes = diffNcmRows([], [base('0101.21.00')], 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe('NCM_ADDED');
    expect(changes[0].ncm_code).toBe('0101.21.00');
    expect(changes[0].new_value).toContain('0101.21.00');
  });

  it('detects REMOVED', () => {
    const changes = diffNcmRows([base('9999.99.99')], [], 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe('NCM_REMOVED');
  });

  it('detects MODIFIED per field', () => {
    const old = [base('0101.21.00', { descricao: 'Old desc' })];
    const now = [base('0101.21.00', { descricao: 'New desc' })];
    const changes = diffNcmRows(old, now, 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe('NCM_MODIFIED');
    expect(changes[0].field_changed).toBe('descricao');
    expect(changes[0].old_value).toBe('Old desc');
    expect(changes[0].new_value).toBe('New desc');
  });

  it('emits one entry per changed field', () => {
    const old = [base('0101.21.00', { descricao: 'A', data_fim: '9999-12-31' })];
    const now = [base('0101.21.00', { descricao: 'B', data_fim: '2030-12-31' })];
    const changes = diffNcmRows(old, now, 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(2);
    const fields = changes.map(c => c.field_changed).sort();
    expect(fields).toEqual(['data_fim', 'descricao']);
  });

  it('produces no changes when inputs are identical', () => {
    const rows = [base('0101.21.00')];
    expect(diffNcmRows(rows, rows, 1, '2026-04-18T00:00:00Z')).toHaveLength(0);
  });
});
