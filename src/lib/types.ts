export type NcmLevel = 2 | 4 | 5 | 8;
export type Modalidade = 'Importação' | 'Exportação';
export type FillType =
  | 'LISTA_ESTATICA' | 'BOOLEANO' | 'DATA'
  | 'TEXTO' | 'NUMERO_INTEIRO' | 'NUMERO_REAL';
export type RowSource = 'base' | 'conditional' | 'empty_ncm';

export interface NcmRow {
  codigo: string;
  descricao: string;
  level: NcmLevel;
  data_inicio: string | null;
  data_fim: string | null;
  tipo_ato_ini: string | null;
  numero_ato_ini: string | null;
  ano_ato_ini: string | null;
}

export interface DomainValue { codigo: string; descricao: string; }

export interface AttributeDef {
  codigo: string;
  nome: string;
  nome_apresentacao: string;
  definicao: string;
  orientacao_preenchimento: string;
  forma_preenchimento: FillType;
  data_inicio: string;
  data_fim: string;
  dominio: DomainValue[];
  objetivos: DomainValue[];
  orgaos: string[];
  atributo_condicionante: boolean;
}

export interface NcmAttrMapping {
  ncm_code: string;
  attr_code: string;
  modalidade: Modalidade;
  obrigatorio: boolean;
  multivalorado: boolean;
  data_inicio: string;
  data_fim: string;
}

export type ConditionOperator = 'EQ' | 'NEQ' | 'IN' | 'FILLED' | 'UNKNOWN';

export interface ConditionalRule {
  parent_attr_code: string;
  condition_desc: string;
  parent_operator: ConditionOperator;
  parent_value: string;
  child_attr_code: string;
  child_nome: string;
  child_nome_apresentacao: string;
  child_obrigatorio: boolean;
  child_multivalorado: boolean;
  child_forma_preenchimento: FillType;
  child_dominio: DomainValue[];
  child_objetivos: DomainValue[];
  child_orgaos: string[];
}

export type ChangeType =
  | 'NCM_ADDED' | 'NCM_REMOVED' | 'NCM_MODIFIED'
  | 'MAP_ADDED' | 'MAP_REMOVED' | 'MAP_MODIFIED'
  | 'ATTR_DEF_ADDED' | 'ATTR_DEF_REMOVED' | 'ATTR_DEF_MODIFIED'
  | 'COND_ADDED' | 'COND_REMOVED' | 'COND_MODIFIED'
  | 'DOMAIN_VALUE_ADDED' | 'DOMAIN_VALUE_REMOVED' | 'DOMAIN_VALUE_MODIFIED';

export interface ChangelogEntry {
  update_run_id: number;
  change_type: ChangeType;
  ncm_code: string | null;
  attr_code: string | null;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
}
