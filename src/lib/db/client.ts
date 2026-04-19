import type { DbRequest, DbResponse, OpRequest } from './rpc';

class DbClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: DbResponse) => void>();

  private ensure() {
    if (this.worker) return;
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<{ id: number } & DbResponse>) => {
      const cb = this.pending.get(ev.data.id);
      if (cb) { this.pending.delete(ev.data.id); cb(ev.data); }
    };
  }

  private call<T = unknown>(req: DbRequest | OpRequest): Promise<T> {
    this.ensure();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (res) => res.ok ? resolve(res.result as T) : reject(new Error(res.error)));
      this.worker!.postMessage({ id, ...req });
    });
  }

  init() { return this.call({ kind: 'init' }); }
  exec(sql: string, params?: unknown[]) { return this.call<null>({ kind: 'exec', sql, params }); }
  select<T = any>(sql: string, params?: unknown[]) { return this.call<T[]>({ kind: 'select', sql, params }); }
  bulk(sql: string, rows: unknown[][]) { return this.call<number>({ kind: 'bulk', sql, rows }); }
  close() { return this.call<null>({ kind: 'close' }); }

  importNcm(rawJson: string) { return this.call<number>({ kind: 'importNcm', rawJson }); }
  importAttrs(zipData: Uint8Array) { return this.call<number>({ kind: 'importAttrs', zipData }); }
  search(query: string, classifiableOnly = true) { return this.call<any[]>({ kind: 'search', query, classifiableOnly }); }
  expand(productId: number, modalidades: string[], mandatoryOnly: boolean, excludedAttrs: string[]) {
    return this.call<null>({ kind: 'expand', productId, modalidades, mandatoryOnly, excludedAttrs } as any);
  }
  expandConditionals(productId: number) { return this.call<null>({ kind: 'expandConditionals', productId }); }
}

export const db = new DbClient();
