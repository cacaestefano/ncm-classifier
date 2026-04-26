import type { AttributeDef, NcmAttrMapping, ConditionalRule, FillType } from '../types';
import { parseCondition } from './condition-parser';

export interface ParsedAttrs {
  versao: number;
  defs: AttributeDef[];
  mappings: NcmAttrMapping[];
  conditionals: ConditionalRule[];
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
        const parsed = parseCondition(desc);
        conditionals.push({
          parent_attr_code: parsed.parent_attr_code || d.codigo,
          condition_desc: desc,
          parent_operator: parsed.parent_operator,
          parent_value: parsed.parent_value,
          child_attr_code: childCode,
          child_nome: child.nome ?? '',
          child_nome_apresentacao: child.nomeApresentacao ?? child.nome ?? '',
          child_obrigatorio: !!(child.obrigatorio ?? c.obrigatorio),
          child_multivalorado: !!(child.multivalorado ?? c.multivalorado),
          child_forma_preenchimento: (child.formaPreenchimento ?? 'TEXTO') as FillType,
          child_dominio: child.dominio ?? [],
          child_objetivos: child.objetivos ?? [],
          child_orgaos: child.orgaos ?? []
        });
      }
    }
  }

  return { versao: data.versao ?? 0, defs, mappings, conditionals };
}
