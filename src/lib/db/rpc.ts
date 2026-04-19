export type DbRequest =
  | { kind: 'init' }
  | { kind: 'exec'; sql: string; params?: unknown[] }
  | { kind: 'select'; sql: string; params?: unknown[] }
  | { kind: 'bulk'; sql: string; rows: unknown[][] }
  | { kind: 'close' };

export type DbResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export type OpRequest =
  | { kind: 'importNcm'; rawJson: string }
  | { kind: 'importAttrs'; zipData: Uint8Array }
  | { kind: 'search'; query: string; classifiableOnly: boolean }
  | { kind: 'expand'; productId: number; modalidades: ('Importação'|'Exportação')[]; mandatoryOnly: boolean; excludedAttrs: string[] }
  | { kind: 'expandConditionals'; productId: number };
