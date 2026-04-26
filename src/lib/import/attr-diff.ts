import type { ChangelogEntry, AttributeDef, NcmAttrMapping, ConditionalRule, DomainValue } from '../types';
import type { ParsedAttrs } from './attr-import';

const DEF_FIELDS: (keyof AttributeDef)[] = [
  'nome', 'nome_apresentacao', 'definicao', 'orientacao_preenchimento',
  'forma_preenchimento', 'data_inicio', 'data_fim', 'atributo_condicionante'
];
const MAP_FIELDS: (keyof NcmAttrMapping)[] = ['obrigatorio', 'multivalorado', 'data_inicio', 'data_fim'];

const mapKey = (m: NcmAttrMapping) => `${m.ncm_code}|${m.attr_code}|${m.modalidade}`;
const condKey = (c: ConditionalRule) => `${c.parent_attr_code}|${c.child_attr_code}|${c.parent_operator}|${c.parent_value}`;

function diffDomain(
  attrCode: string, oldDom: DomainValue[], newDom: DomainValue[],
  runId: number, _loggedAt: string
): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  const oldMap = new Map(oldDom.map(d => [d.codigo, d]));
  const newMap = new Map(newDom.map(d => [d.codigo, d]));
  for (const [c, v] of newMap) {
    if (!oldMap.has(c)) out.push({
      update_run_id: runId, change_type: 'DOMAIN_VALUE_ADDED',
      ncm_code: null, attr_code: attrCode, field_changed: c,
      old_value: null, new_value: JSON.stringify(v)
    });
  }
  for (const [c, v] of oldMap) {
    if (!newMap.has(c)) out.push({
      update_run_id: runId, change_type: 'DOMAIN_VALUE_REMOVED',
      ncm_code: null, attr_code: attrCode, field_changed: c,
      old_value: JSON.stringify(v), new_value: null
    });
    else {
      const n = newMap.get(c)!;
      if (n.descricao !== v.descricao) out.push({
        update_run_id: runId, change_type: 'DOMAIN_VALUE_MODIFIED',
        ncm_code: null, attr_code: attrCode, field_changed: c,
        old_value: v.descricao, new_value: n.descricao
      });
    }
  }
  return out;
}

export function diffAttributes(
  oldP: ParsedAttrs, newP: ParsedAttrs, runId: number, loggedAt: string
): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];

  const oldDefs = new Map(oldP.defs.map(d => [d.codigo, d]));
  const newDefs = new Map(newP.defs.map(d => [d.codigo, d]));
  for (const [code, d] of newDefs) {
    if (!oldDefs.has(code)) out.push({
      update_run_id: runId, change_type: 'ATTR_DEF_ADDED', ncm_code: null,
      attr_code: code, field_changed: null, old_value: null, new_value: JSON.stringify(d)
    });
  }
  for (const [code, d] of oldDefs) {
    if (!newDefs.has(code)) {
      out.push({
        update_run_id: runId, change_type: 'ATTR_DEF_REMOVED', ncm_code: null,
        attr_code: code, field_changed: null, old_value: JSON.stringify(d), new_value: null
      });
    } else {
      const n = newDefs.get(code)!;
      for (const f of DEF_FIELDS) {
        if (d[f] !== n[f]) out.push({
          update_run_id: runId, change_type: 'ATTR_DEF_MODIFIED', ncm_code: null,
          attr_code: code, field_changed: f as string,
          old_value: String(d[f] ?? ''), new_value: String(n[f] ?? '')
        });
      }
      out.push(...diffDomain(code, d.dominio, n.dominio, runId, loggedAt));
    }
  }

  const oldMap = new Map(oldP.mappings.map(m => [mapKey(m), m]));
  const newMap = new Map(newP.mappings.map(m => [mapKey(m), m]));
  for (const [k, m] of newMap) {
    if (!oldMap.has(k)) out.push({
      update_run_id: runId, change_type: 'MAP_ADDED',
      ncm_code: m.ncm_code, attr_code: m.attr_code, field_changed: null,
      old_value: null, new_value: JSON.stringify(m)
    });
  }
  for (const [k, m] of oldMap) {
    if (!newMap.has(k)) out.push({
      update_run_id: runId, change_type: 'MAP_REMOVED',
      ncm_code: m.ncm_code, attr_code: m.attr_code, field_changed: null,
      old_value: JSON.stringify(m), new_value: null
    });
    else {
      const n = newMap.get(k)!;
      for (const f of MAP_FIELDS) {
        if (m[f] !== n[f]) out.push({
          update_run_id: runId, change_type: 'MAP_MODIFIED',
          ncm_code: m.ncm_code, attr_code: m.attr_code, field_changed: f as string,
          old_value: String(m[f] ?? ''), new_value: String(n[f] ?? '')
        });
      }
    }
  }

  const oldCond = new Map(oldP.conditionals.map(c => [condKey(c), c]));
  const newCond = new Map(newP.conditionals.map(c => [condKey(c), c]));
  for (const [k, c] of newCond) {
    if (!oldCond.has(k)) out.push({
      update_run_id: runId, change_type: 'COND_ADDED',
      ncm_code: null, attr_code: c.parent_attr_code, field_changed: c.child_attr_code,
      old_value: null, new_value: JSON.stringify(c)
    });
  }
  for (const [k, c] of oldCond) {
    if (!newCond.has(k)) out.push({
      update_run_id: runId, change_type: 'COND_REMOVED',
      ncm_code: null, attr_code: c.parent_attr_code, field_changed: c.child_attr_code,
      old_value: JSON.stringify(c), new_value: null
    });
  }
  return out;
}
