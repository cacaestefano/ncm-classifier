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
        const parsed = parseCondition(c.descricao ?? '');
        conditionals.push({
          parent_attr_code: parsed.parent_attr_code || d.codigo,
          condition_desc: c.descricao ?? '',
          parent_operator: parsed.parent_operator,
          parent_value: parsed.parent_value,
          child_attr_code: c.codigo,
          child_nome: c.nome ?? '',
          child_nome_apresentacao: c.nomeApresentacao ?? c.nome ?? '',
          child_obrigatorio: !!c.obrigatorio,
          child_multivalorado: !!c.multivalorado,
          child_forma_preenchimento: (c.formaPreenchimento ?? 'TEXTO') as FillType,
          child_dominio: c.dominio ?? [],
          child_objetivos: c.objetivos ?? [],
          child_orgaos: c.orgaos ?? []
        });
      }
    }
  }

  return { versao: data.versao ?? 0, defs, mappings, conditionals };
}
