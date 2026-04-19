import { db } from '$lib/db/client';

export interface AppSettings {
  modalidades: ('Importação' | 'Exportação')[];
  mandatoryOnly: boolean;
  excludedAttrs: string[];
  regulatoryBodyFilter: string[];
  extraLabels: [string, string, string, string, string];
  projectName: string;
}

const DEFAULT: AppSettings = {
  modalidades: ['Importação', 'Exportação'],
  mandatoryOnly: false,
  excludedAttrs: [],
  regulatoryBodyFilter: [],
  extraLabels: ['', '', '', '', ''],
  projectName: 'projeto'
};

class SettingsStore {
  current = $state<AppSettings>({ ...DEFAULT });

  async load() {
    await db.init();
    const rows = await db.select<{ key: string; value_json: string }>(`SELECT key, value_json FROM settings`);
    const loaded = { ...DEFAULT };
    for (const r of rows) {
      try { (loaded as any)[r.key] = JSON.parse(r.value_json); } catch {}
    }
    this.current = loaded;
  }

  async save() {
    await db.init();
    for (const key of Object.keys(this.current) as (keyof AppSettings)[]) {
      await db.exec(`INSERT OR REPLACE INTO settings(key, value_json) VALUES (?, ?)`, [key, JSON.stringify(this.current[key])]);
    }
  }
}

export const settings = new SettingsStore();
