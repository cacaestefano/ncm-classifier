import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL, SCHEMA_VERSION } from './schema';
import type { DbRequest, DbResponse, OpRequest } from './rpc';

let db: any = null;

async function init() {
  if (db) return;
  const sqlite3 = await (sqlite3InitModule as any)({ print: () => {}, printErr: console.error });
  // Use OPFS if available, otherwise in-memory
  try {
    db = new sqlite3.oo1.OpfsDb('/ncm-classifier.db', 'ct');
  } catch {
    db = new sqlite3.oo1.DB(':memory:', 'ct');
  }
  for (const stmt of DDL) db.exec(stmt);
  const row = db.selectValue('SELECT version FROM schema_version');
  if (row == null) {
    db.exec({ sql: 'INSERT INTO schema_version(version) VALUES (?)', bind: [SCHEMA_VERSION] });
  }
}

function toJsonSafe(v: unknown): unknown {
  if (v instanceof Uint8Array) return Array.from(v);
  return v;
}

self.onmessage = async (ev: MessageEvent<(DbRequest | OpRequest) & { id: number }>) => {
  const { id, ...req } = ev.data;
  const reply = (res: DbResponse) => (self as any).postMessage({ id, ...res });
  try {
    if (req.kind === 'init') { await init(); reply({ ok: true, result: null }); return; }
    await init();
    if (req.kind === 'exec') {
      db.exec({ sql: req.sql, bind: req.params ?? [] });
      reply({ ok: true, result: null });
    } else if (req.kind === 'select') {
      const rows = db.selectObjects(req.sql, req.params ?? []);
      reply({ ok: true, result: rows.map((r: any) => {
        const o: any = {};
        for (const k in r) o[k] = toJsonSafe(r[k]);
        return o;
      }) });
    } else if (req.kind === 'bulk') {
      db.transaction(() => {
        const stmt = db.prepare(req.sql);
        try {
          for (const row of req.rows) {
            stmt.bind(row).stepReset();
          }
        } finally { stmt.finalize(); }
      });
      reply({ ok: true, result: req.rows.length });
    } else if (req.kind === 'close') {
      db?.close(); db = null;
      reply({ ok: true, result: null });
    } else if (req.kind === 'importNcm') {
      const { importNcm } = await import('../import/ncm-orchestrator');
      const runId = await importNcm(db, req.rawJson, new Date().toISOString());
      reply({ ok: true, result: runId });
    } else if (req.kind === 'importAttrs') {
      const { importAttributes } = await import('../import/attr-orchestrator');
      const runId = await importAttributes(db, req.zipData, new Date().toISOString());
      reply({ ok: true, result: runId });
    } else if (req.kind === 'search') {
      const { searchNcm } = await import('../core/search');
      reply({ ok: true, result: searchNcm(db, req.query, { classifiableOnly: req.classifiableOnly }) });
    } else if (req.kind === 'expand') {
      const { expandAttributesForProduct } = await import('../core/expansion');
      expandAttributesForProduct(db, req.productId, {
        modalidades: req.modalidades, mandatoryOnly: req.mandatoryOnly,
        excludedAttrs: req.excludedAttrs, today: new Date().toISOString().slice(0,10)
      });
      reply({ ok: true, result: null });
    } else if (req.kind === 'expandConditionals') {
      const { expandConditionalsForProduct } = await import('../core/conditionals');
      expandConditionalsForProduct(db, req.productId);
      reply({ ok: true, result: null });
    }
  } catch (e: any) {
    reply({ ok: false, error: e?.message ?? String(e) });
  }
};
