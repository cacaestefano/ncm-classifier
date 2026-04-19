import { db } from '$lib/db/client';

class DbStatus {
  ncmCount = $state<number | null>(null);
  attrCount = $state<number | null>(null);
  mappingCount = $state<number | null>(null);
  lastAto = $state<string>('');
  lastDataAtualizacao = $state<string>('');
  lastVersao = $state<number | null>(null);
  lastRunAt = $state<string>('');

  async refresh() {
    await db.init();
    this.ncmCount = (await db.select<{c:number}>(`SELECT COUNT(*) as c FROM ncm`))[0].c;
    this.attrCount = (await db.select<{c:number}>(`SELECT COUNT(*) as c FROM attribute_def`))[0].c;
    this.mappingCount = (await db.select<{c:number}>(`SELECT COUNT(*) as c FROM ncm_attr`))[0].c;
    const last = await db.select<any>(`SELECT * FROM update_run ORDER BY id DESC LIMIT 1`);
    if (last[0]) {
      this.lastAto = last[0].ncm_source_ato ?? '';
      this.lastDataAtualizacao = last[0].ncm_data_atualizacao ?? '';
      this.lastVersao = last[0].attr_versao ?? null;
      this.lastRunAt = last[0].run_at ?? '';
    }
  }

  get hasData() { return (this.ncmCount ?? 0) > 0 && (this.attrCount ?? 0) > 0; }
}

export const dbStatus = new DbStatus();
