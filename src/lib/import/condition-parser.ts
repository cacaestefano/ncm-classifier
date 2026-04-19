import type { ConditionOperator } from '../types';

const OPERATORS: Record<string, ConditionOperator> = {
  'Igual': 'EQ',
  'Diferente': 'NEQ',
  'Contido em': 'IN',
  'Preenchido': 'FILLED'
};

const PATTERN = /^'([^']+)'\s+(Igual|Diferente|Contido em|Preenchido|[\wÀ-ÿ]+)(?:\s+'([^']*)')?\s*$/;

export interface ParsedCondition {
  parent_attr_code: string;
  parent_operator: ConditionOperator;
  parent_value: string;
}

export function parseCondition(text: string): ParsedCondition {
  const m = PATTERN.exec(text.trim());
  if (!m) {
    return { parent_attr_code: '', parent_operator: 'UNKNOWN', parent_value: text };
  }
  const op = OPERATORS[m[2]] ?? 'UNKNOWN';
  return {
    parent_attr_code: m[1],
    parent_operator: op,
    parent_value: m[3] ?? ''
  };
}
