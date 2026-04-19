import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAttrJson } from '../../src/lib/import/attr-import';

describe('parseAttrJson', () => {
  const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');

  it('extracts versao', () => {
    const p = parseAttrJson(raw);
    expect(p.versao).toBe(282);
  });

  it('extracts mappings', () => {
    const p = parseAttrJson(raw);
    expect(p.mappings).toHaveLength(2);
    const m = p.mappings.find(x => x.attr_code === 'ATT_9332')!;
    expect(m.ncm_code).toBe('0101.21.00');
    expect(m.obrigatorio).toBe(true);
  });

  it('extracts attribute definitions', () => {
    const p = parseAttrJson(raw);
    expect(p.defs).toHaveLength(2);
    const d = p.defs.find(x => x.codigo === 'ATT_9332')!;
    expect(d.nome_apresentacao).toBe('Material de fabricação');
    expect(d.forma_preenchimento).toBe('LISTA_ESTATICA');
    expect(d.dominio).toHaveLength(2);
    expect(d.atributo_condicionante).toBe(true);
  });

  it('extracts conditional rules from condicionados', () => {
    const p = parseAttrJson(raw);
    expect(p.conditionals).toHaveLength(1);
    const c = p.conditionals[0];
    expect(c.parent_attr_code).toBe('ATT_9332');
    expect(c.child_attr_code).toBe('ATT_9999');
    expect(c.parent_operator).toBe('EQ');
    expect(c.parent_value).toBe('999');
  });
});
