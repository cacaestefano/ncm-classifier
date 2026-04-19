import { describe, it, expect } from 'vitest';
import { diffAttributes } from '../../src/lib/import/attr-diff';
import type { ParsedAttrs } from '../../src/lib/import/attr-import';

const mk = (overrides: Partial<ParsedAttrs> = {}): ParsedAttrs => ({
  versao: 1, defs: [], mappings: [], conditionals: [], ...overrides
});

describe('diffAttributes', () => {
  it('detects ATTR_DEF_ADDED', () => {
    const old = mk();
    const now = mk({ defs: [{
      codigo: 'A', nome: 'N', nome_apresentacao: 'NA', definicao: '', orientacao_preenchimento: '',
      forma_preenchimento: 'TEXTO', data_inicio: '', data_fim: '',
      dominio: [], objetivos: [], orgaos: [], atributo_condicionante: false
    }]});
    const e = diffAttributes(old, now, 1, '2026-04-18T00:00:00Z');
    expect(e.filter(x => x.change_type === 'ATTR_DEF_ADDED')).toHaveLength(1);
  });

  it('detects DOMAIN_VALUE_ADDED when domain list grows', () => {
    const base = {
      codigo: 'A', nome: '', nome_apresentacao: '', definicao: '', orientacao_preenchimento: '',
      forma_preenchimento: 'LISTA_ESTATICA' as const, data_inicio: '', data_fim: '',
      objetivos: [], orgaos: [], atributo_condicionante: false
    };
    const old = mk({ defs: [{ ...base, dominio: [{codigo:'01', descricao:'A'}] }] });
    const now = mk({ defs: [{ ...base, dominio: [{codigo:'01', descricao:'A'}, {codigo:'02', descricao:'B'}] }] });
    const e = diffAttributes(old, now, 1, '2026-04-18T00:00:00Z');
    const added = e.filter(x => x.change_type === 'DOMAIN_VALUE_ADDED');
    expect(added).toHaveLength(1);
    expect(added[0].new_value).toContain('02');
  });

  it('detects MAP_ADDED and MAP_REMOVED', () => {
    const old = mk({ mappings: [{ ncm_code: 'X', attr_code: 'A', modalidade: 'Importação', obrigatorio: true, multivalorado: false, data_inicio: '', data_fim: '' }] });
    const now = mk({ mappings: [{ ncm_code: 'X', attr_code: 'B', modalidade: 'Importação', obrigatorio: true, multivalorado: false, data_inicio: '', data_fim: '' }] });
    const e = diffAttributes(old, now, 1, '2026-04-18T00:00:00Z');
    expect(e.some(x => x.change_type === 'MAP_ADDED' && x.attr_code === 'B')).toBe(true);
    expect(e.some(x => x.change_type === 'MAP_REMOVED' && x.attr_code === 'A')).toBe(true);
  });
});
