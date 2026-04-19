export type DbRequest =
  | { kind: 'init' }
  | { kind: 'exec'; sql: string; params?: unknown[] }
  | { kind: 'select'; sql: string; params?: unknown[] }
  | { kind: 'bulk'; sql: string; rows: unknown[][] }
  | { kind: 'close' };

export type DbResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };
