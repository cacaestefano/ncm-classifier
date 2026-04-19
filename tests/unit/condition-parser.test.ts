import { describe, it, expect } from 'vitest';
import { parseCondition } from '../../src/lib/import/condition-parser';

describe('parseCondition', () => {
  it('parses Igual', () => {
    expect(parseCondition("'ATT_8807' Igual '999'")).toEqual({
      parent_attr_code: 'ATT_8807',
      parent_operator: 'EQ',
      parent_value: '999'
    });
  });
  it('parses Diferente', () => {
    expect(parseCondition("'ATT_100' Diferente '01'")).toEqual({
      parent_attr_code: 'ATT_100',
      parent_operator: 'NEQ',
      parent_value: '01'
    });
  });
  it('parses Contido em with multiple values', () => {
    expect(parseCondition("'ATT_50' Contido em '01,02,03'")).toEqual({
      parent_attr_code: 'ATT_50',
      parent_operator: 'IN',
      parent_value: '01,02,03'
    });
  });
  it('parses Preenchido (no value)', () => {
    expect(parseCondition("'ATT_77' Preenchido")).toEqual({
      parent_attr_code: 'ATT_77',
      parent_operator: 'FILLED',
      parent_value: ''
    });
  });
  it('returns UNKNOWN for unrecognized operators but keeps the raw value', () => {
    const r = parseCondition("'ATT_99' Qualquer '42'");
    expect(r.parent_operator).toBe('UNKNOWN');
    expect(r.parent_attr_code).toBe('ATT_99');
    expect(r.parent_value).toBe('42');
  });
});
