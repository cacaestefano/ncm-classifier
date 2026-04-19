import type { NcmRow } from '../types';
import { brDateToIso } from './date-utils';
import { detectLevel } from './level-detector';

export interface NcmMeta {
  ato: string;
  data_atualizacao: string;
}

export interface ParsedNcm {
  rows: NcmRow[];
  meta: NcmMeta;
}

export function parseNcmJson(raw: string): ParsedNcm {
  const data = JSON.parse(raw);
  if (!Array.isArray(data.Nomenclaturas)) {
    throw new Error('Invalid NCM JSON: missing Nomenclaturas array');
  }
  const rows: NcmRow[] = data.Nomenclaturas.map((n: any) => ({
    codigo: n.Codigo,
    descricao: n.Descricao,
    level: detectLevel(n.Codigo),
    data_inicio: brDateToIso(n.Data_Inicio),
    data_fim: brDateToIso(n.Data_Fim),
    tipo_ato_ini: n.Tipo_Ato_Ini ?? null,
    numero_ato_ini: n.Numero_Ato_Ini ?? null,
    ano_ato_ini: n.Ano_Ato_Ini ?? null
  }));
  return {
    rows,
    meta: {
      ato: data.Ato ?? '',
      data_atualizacao: data.Data_Ultima_Atualizacao_NCM ?? ''
    }
  };
}
