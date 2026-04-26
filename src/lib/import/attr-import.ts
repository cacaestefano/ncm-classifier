import type { AttributeDef, NcmAttrMapping, ConditionalRule, ConditionOperator, FillType } from '../types';
import { parseCondition } from './condition-parser';

export interface ParsedAttrs {
  versao: number;
  defs: AttributeDef[];
  mappings: NcmAttrMapping[];
  conditionals: ConditionalRule[];
}

interface CondNode {
  operador?: string;
  valor?: string;
  composicao?: string;
  condicao?: CondNode;
}

function mapOperator(op: string | undefined): ConditionOperator {
  switch (op) {
    case '==': return 'EQ';
    case '!=': return 'NEQ';
    case 'in': case 'IN': return 'IN';
    case 'preenchido': case 'PREENCHIDO': return 'FILLED';
    default: return 'UNKNOWN';
  }
}

function flattenCondicao(node: CondNode | undefined): { op: ConditionOperator; value: string }[] {
  const out: { op: ConditionOperator; value: string }[] = [];
  let cur: CondNode | undefined = node;
  let onlyOr = true;
  while (cur) {
    if (cur.operador !== undefined) {
      out.push({ op: mapOperator(cur.operador), value: cur.valor ?? '' });
    }
    if (cur.composicao && cur.composicao !== '||') onlyOr = false;
    cur = cur.condicao;
  }
  return onlyOr ? out : [];
}

export function parseAttrJson(raw: string): ParsedAttrs {
  const data = JSON.parse(raw);
  if (!Array.isArray(data.listaNcm) || !Array.isArray(data.detalhesAtributos)) {
    throw new Error('Invalid attributes JSON: missing listaNcm or detalhesAtributos');
  }

  const mappings: NcmAttrMapping[] = [];
  for (const ncm of data.listaNcm) {
    for (const a of ncm.listaAtributos ?? []) {
      mappings.push({
        ncm_code: ncm.codigoNcm,
        attr_code: a.codigo,
        modalidade: a.modalidade,
        obrigatorio: !!a.obrigatorio,
        multivalorado: !!a.multivalorado,
        data_inicio: a.dataInicioVigencia ?? '',
        data_fim: a.dataFimVigencia ?? ''
      });
    }
  }

  const defs: AttributeDef[] = [];
  const conditionals: ConditionalRule[] = [];

  for (const d of data.detalhesAtributos) {
    defs.push({
      codigo: d.codigo,
      nome: d.nome ?? '',
      nome_apresentacao: d.nomeApresentacao ?? d.nome ?? '',
      definicao: d.definicao ?? '',
      orientacao_preenchimento: d.orientacaoPreenchimento ?? '',
      forma_preenchimento: (d.formaPreenchimento ?? 'TEXTO') as FillType,
      data_inicio: d.dataInicioVigencia ?? '',
      data_fim: d.dataFimVigencia ?? '',
      dominio: d.dominio ?? [],
      objetivos: d.objetivos ?? [],
      orgaos: d.orgaos ?? [],
      atributo_condicionante: !!d.atributoCondicionante
    });

    if (d.atributoCondicionante && Array.isArray(d.condicionados)) {
      for (const c of d.condicionados) {
        const child = c.atributo ?? c;
        const childCode = child.codigo ?? c.codigo;
        if (!childCode) continue;
        const desc = c.descricaoCondicao ?? c.descricao ?? '';

        let triggers: { op: ConditionOperator; value: string }[] = [];
        if (c.condicao) {
          triggers = flattenCondicao(c.condicao);
        }
        if (triggers.length === 0) {
          const parsed = parseCondition(desc);
          triggers = [{ op: parsed.parent_operator, value: parsed.parent_value }];
        }

        const childCommon = {
          child_attr_code: childCode,
          child_nome: child.nome ?? '',
          child_nome_apresentacao: child.nomeApresentacao ?? child.nome ?? '',
          child_obrigatorio: !!(child.obrigatorio ?? c.obrigatorio),
          child_multivalorado: !!(child.multivalorado ?? c.multivalorado),
          child_forma_preenchimento: (child.formaPreenchimento ?? 'TEXTO') as FillType,
          child_dominio: child.dominio ?? [],
          child_objetivos: child.objetivos ?? [],
          child_orgaos: child.orgaos ?? []
        };

        for (const t of triggers) {
          conditionals.push({
            parent_attr_code: d.codigo,
            condition_desc: desc,
            parent_operator: t.op,
            parent_value: t.value,
            ...childCommon
          });
        }
      }
    }
  }

  return { versao: data.versao ?? 0, defs, mappings, conditionals };
}
