# NCM Classifier Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only static web app that replaces the existing Excel VBA NCM Classifier — accepts client product data, lets the user search/assign NCM codes, expands attributes with conditional second-pass, and exports CSV/XLSX. Works offline after first load.

**Architecture:** SvelteKit static site, SQLite-WASM with OPFS for persistence, Web Worker for heavy parsing/diff, drag-and-drop file import (Siscomex has no CORS), Service Worker for offline. All code in TypeScript. Seven routes: Database, Import, Map Columns, Classify, Export, Settings, Changelog.

**Tech Stack:** Svelte 5 + SvelteKit (static adapter), Vite, `@sqlite.org/sqlite-wasm`, `fflate`, `exceljs`, `svelte-virtual`, `vite-plugin-pwa`. Testing: Vitest (unit + integration) and Playwright (E2E).

**Source documents:**
- Original spec: `docs/ncm-classifier-agent-spec.md`
- Design: `docs/superpowers/specs/2026-04-18-ncm-classifier-web-app-design.md`

---

## File Structure

```
ncm-classifier/
├── src/
│   ├── app.html
│   ├── app.css
│   ├── lib/
│   │   ├── types.ts                    # Shared TS interfaces
│   │   ├── db/
│   │   │   ├── schema.ts               # DDL strings
│   │   │   ├── client.ts               # Public DB API
│   │   │   ├── worker.ts               # Worker entry point
│   │   │   └── rpc.ts                  # Main↔Worker message protocol
│   │   ├── import/
│   │   │   ├── date-utils.ts           # Date conversions
│   │   │   ├── level-detector.ts       # NCM code → hierarchy level
│   │   │   ├── condition-parser.ts     # Parse "'ATT_X' Igual '999'"
│   │   │   ├── ncm-import.ts           # NCM JSON → DB rows
│   │   │   ├── attr-import.ts          # Attributes ZIP → DB rows
│   │   │   └── diff-engine.ts          # Old/new → changelog entries
│   │   ├── core/
│   │   │   ├── search.ts               # FTS queries
│   │   │   ├── expansion.ts            # Attribute expansion
│   │   │   └── conditionals.ts         # Conditional second-pass
│   │   ├── export/
│   │   │   ├── csv.ts
│   │   │   └── xlsx.ts
│   │   └── stores/
│   │       ├── db-status.svelte.ts
│   │       ├── project.svelte.ts
│   │       └── settings.svelte.ts
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte                # → redirects to /database
│       ├── database/+page.svelte
│       ├── import/+page.svelte
│       ├── mapping/+page.svelte
│       ├── classify/+page.svelte
│       ├── export/+page.svelte
│       ├── settings/+page.svelte
│       └── changelog/+page.svelte
├── static/
│   ├── manifest.webmanifest
│   └── favicon.png
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── vite.config.ts
├── svelte.config.js
├── playwright.config.ts
├── vitest.config.ts
├── package.json
└── tsconfig.json
```

---

## Phase 0 — Bootstrap

### Task 1: Initialize git and create SvelteKit project

**Files:**
- Create: everything under `ncm-classifier/` except existing `docs/`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/rodrigoamorim/projects/ncm-classifier
git init
git add docs/
git commit -m "chore: initial commit with spec and design docs"
```

- [ ] **Step 2: Scaffold SvelteKit with static adapter**

```bash
npm create svelte@latest ncm-app
# choose: Skeleton project, TypeScript, ESLint, Prettier, Vitest, Playwright
mv ncm-app/* ncm-app/.* .
rmdir ncm-app
```

- [ ] **Step 3: Install adapter-static and switch to it**

```bash
npm install -D @sveltejs/adapter-static
```

Edit `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    paths: { base: process.env.BASE_PATH || '' }
  }
};
```

- [ ] **Step 4: Run dev server to confirm it works**

```bash
npm run dev
# Open printed URL, confirm default page loads
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold SvelteKit with static adapter"
```

### Task 2: Install runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install @sqlite.org/sqlite-wasm fflate exceljs svelte-virtual
npm install -D vite-plugin-pwa @vite-pwa/assets-generator
```

- [ ] **Step 2: Add COOP/COEP headers to dev config** (required for SQLite-WASM SharedArrayBuffer in workers)

Edit `vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    sveltekit(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      manifest: {
        name: 'NCM Classifier',
        short_name: 'NCM',
        description: 'Classificador NCM offline',
        theme_color: '#1a1a1a',
        icons: [
          { src: '/favicon.png', sizes: '192x192', type: 'image/png' }
        ]
      }
    })
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] }
});
```

- [ ] **Step 3: Run dev server, verify no errors**

```bash
npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "chore: install runtime deps and configure Vite + PWA"
```

### Task 3: Set up test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/fixtures/.gitkeep`

- [ ] **Step 1: Create Vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000
  }
});
```

- [ ] **Step 2: Add fixtures placeholder**

```bash
mkdir -p tests/unit tests/integration tests/e2e tests/fixtures
touch tests/fixtures/.gitkeep
```

- [ ] **Step 3: Add trivial smoke test to confirm runner works**

`tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- --run
# Expected: 1 test passing
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/
git commit -m "test: configure Vitest and add smoke test"
```

### Task 4: Create shared types file

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Define domain types**

`src/lib/types.ts`:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared domain types"
```

---

## Phase 1 — Import utilities (pure functions, TDD)

### Task 5: Date conversion utilities

**Files:**
- Create: `src/lib/import/date-utils.ts`
- Create: `tests/unit/date-utils.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/date-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { brDateToIso, isoToBrDate, isExpired } from '../../src/lib/import/date-utils';

describe('brDateToIso', () => {
  it('converts dd/mm/yyyy to yyyy-mm-dd', () => {
    expect(brDateToIso('01/04/2022')).toBe('2022-04-01');
  });
  it('handles sentinel date 31/12/9999', () => {
    expect(brDateToIso('31/12/9999')).toBe('9999-12-31');
  });
  it('returns null for empty input', () => {
    expect(brDateToIso('')).toBeNull();
    expect(brDateToIso(null as any)).toBeNull();
  });
  it('throws on malformed input', () => {
    expect(() => brDateToIso('2022-04-01')).toThrow();
    expect(() => brDateToIso('not a date')).toThrow();
  });
});

describe('isExpired', () => {
  it('treats 9999 dates as never-expiring', () => {
    expect(isExpired('9999-12-31', '2026-04-18')).toBe(false);
  });
  it('returns true for dates before today', () => {
    expect(isExpired('2020-01-01', '2026-04-18')).toBe(true);
  });
  it('returns false for today', () => {
    expect(isExpired('2026-04-18', '2026-04-18')).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(isExpired('', '2026-04-18')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm run test -- --run tests/unit/date-utils.test.ts
# Expected: module not found or failures
```

- [ ] **Step 3: Implement**

`src/lib/import/date-utils.ts`:

```ts
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function brDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = BR_DATE.exec(s);
  if (!m) throw new Error(`Invalid BR date: "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function isoToBrDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function isExpired(endDateIso: string, todayIso: string): boolean {
  if (!endDateIso) return false;
  if (endDateIso.startsWith('9999')) return false;
  return endDateIso < todayIso;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test -- --run tests/unit/date-utils.test.ts
# Expected: all tests passing
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/date-utils.ts tests/unit/date-utils.test.ts
git commit -m "feat: add date conversion utilities"
```

### Task 6: NCM level detector

**Files:**
- Create: `src/lib/import/level-detector.ts`
- Create: `tests/unit/level-detector.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/level-detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectLevel, isClassifiable } from '../../src/lib/import/level-detector';

describe('detectLevel', () => {
  it('returns 2 for chapter codes', () => {
    expect(detectLevel('01')).toBe(2);
  });
  it('returns 4 for heading codes', () => {
    expect(detectLevel('01.01')).toBe(4);
  });
  it('returns 5 for subheading codes', () => {
    expect(detectLevel('0101.2')).toBe(5);
  });
  it('returns 8 for item codes', () => {
    expect(detectLevel('0101.21.00')).toBe(8);
  });
  it('returns 8 for alternate 8-digit formatting', () => {
    expect(detectLevel('0101.2100')).toBe(8);
  });
});

describe('isClassifiable', () => {
  it('accepts 8-digit codes', () => {
    expect(isClassifiable('0101.21.00')).toBe(true);
  });
  it('rejects non-8-digit codes', () => {
    expect(isClassifiable('01.01')).toBe(false);
    expect(isClassifiable('01')).toBe(false);
    expect(isClassifiable('0101.2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test -- --run tests/unit/level-detector.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/import/level-detector.ts`:

```ts
import type { NcmLevel } from '../types';

export function detectLevel(codigo: string): NcmLevel {
  const digits = codigo.replace(/\D/g, '');
  if (digits.length === 2) return 2;
  if (digits.length === 4) return 4;
  if (digits.length === 5) return 5;
  if (digits.length === 8) return 8;
  throw new Error(`Cannot detect level for code "${codigo}" (${digits.length} digits)`);
}

export function isClassifiable(codigo: string): boolean {
  try {
    return detectLevel(codigo) === 8;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Tests pass**

```bash
npm run test -- --run tests/unit/level-detector.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/level-detector.ts tests/unit/level-detector.test.ts
git commit -m "feat: add NCM level detector"
```

### Task 7: Condition-text parser

**Files:**
- Create: `src/lib/import/condition-parser.ts`
- Create: `tests/unit/condition-parser.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/condition-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCondition } from '../../src/lib/import/condition-parser';

describe('parseCondition', () => {
  it('parses Igual', () => {
    expect(parseCondition("'ATT_8807' Igual '999'")).toEqual({
      parent_attr_code: 'ATT_8807',
      parent_operator: 'EQ',
      parent_value: '999'
    });
  });
  it('parses Diferente', () => {
    expect(parseCondition("'ATT_100' Diferente '01'")).toEqual({
      parent_attr_code: 'ATT_100',
      parent_operator: 'NEQ',
      parent_value: '01'
    });
  });
  it('parses Contido em with multiple values', () => {
    expect(parseCondition("'ATT_50' Contido em '01,02,03'")).toEqual({
      parent_attr_code: 'ATT_50',
      parent_operator: 'IN',
      parent_value: '01,02,03'
    });
  });
  it('parses Preenchido (no value)', () => {
    expect(parseCondition("'ATT_77' Preenchido")).toEqual({
      parent_attr_code: 'ATT_77',
      parent_operator: 'FILLED',
      parent_value: ''
    });
  });
  it('returns UNKNOWN for unrecognized operators but keeps the raw value', () => {
    const r = parseCondition("'ATT_99' Qualquer '42'");
    expect(r.parent_operator).toBe('UNKNOWN');
    expect(r.parent_attr_code).toBe('ATT_99');
    expect(r.parent_value).toBe('42');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npm run test -- --run tests/unit/condition-parser.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/import/condition-parser.ts`:

```ts
import type { ConditionOperator } from '../types';

const OPERATORS: Record<string, ConditionOperator> = {
  'Igual': 'EQ',
  'Diferente': 'NEQ',
  'Contido em': 'IN',
  'Preenchido': 'FILLED'
};

const PATTERN = /^'([^']+)'\s+(Igual|Diferente|Contido em|Preenchido|[\wÀ-ÿ]+)(?:\s+'([^']*)')?\s*$/;

export interface ParsedCondition {
  parent_attr_code: string;
  parent_operator: ConditionOperator;
  parent_value: string;
}

export function parseCondition(text: string): ParsedCondition {
  const m = PATTERN.exec(text.trim());
  if (!m) {
    return { parent_attr_code: '', parent_operator: 'UNKNOWN', parent_value: text };
  }
  const op = OPERATORS[m[2]] ?? 'UNKNOWN';
  return {
    parent_attr_code: m[1],
    parent_operator: op,
    parent_value: m[3] ?? ''
  };
}
```

- [ ] **Step 4: Tests pass**

```bash
npm run test -- --run tests/unit/condition-parser.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/condition-parser.ts tests/unit/condition-parser.test.ts
git commit -m "feat: add conditional-attribute condition-text parser"
```

---

## Phase 2 — Database layer

### Task 8: Schema DDL

**Files:**
- Create: `src/lib/db/schema.ts`

- [ ] **Step 1: Create schema module**

`src/lib/db/schema.ts`:

```ts
export const SCHEMA_VERSION = 1;

export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  )`,

  `CREATE TABLE IF NOT EXISTS ncm (
    codigo TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    level INTEGER NOT NULL,
    data_inicio TEXT,
    data_fim TEXT,
    tipo_ato_ini TEXT,
    numero_ato_ini TEXT,
    ano_ato_ini TEXT
  )`,

  `CREATE VIRTUAL TABLE IF NOT EXISTS ncm_fts USING fts5(
    codigo, descricao,
    content='ncm', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 1'
  )`,

  `CREATE TRIGGER IF NOT EXISTS ncm_ai AFTER INSERT ON ncm BEGIN
    INSERT INTO ncm_fts(rowid, codigo, descricao) VALUES (new.rowid, new.codigo, new.descricao);
  END`,

  `CREATE TRIGGER IF NOT EXISTS ncm_ad AFTER DELETE ON ncm BEGIN
    INSERT INTO ncm_fts(ncm_fts, rowid, codigo, descricao) VALUES('delete', old.rowid, old.codigo, old.descricao);
  END`,

  `CREATE TRIGGER IF NOT EXISTS ncm_au AFTER UPDATE ON ncm BEGIN
    INSERT INTO ncm_fts(ncm_fts, rowid, codigo, descricao) VALUES('delete', old.rowid, old.codigo, old.descricao);
    INSERT INTO ncm_fts(rowid, codigo, descricao) VALUES (new.rowid, new.codigo, new.descricao);
  END`,

  `CREATE TABLE IF NOT EXISTS attribute_def (
    codigo TEXT PRIMARY KEY,
    nome TEXT,
    nome_apresentacao TEXT,
    definicao TEXT,
    orientacao_preenchimento TEXT,
    forma_preenchimento TEXT,
    data_inicio TEXT,
    data_fim TEXT,
    dominio_json TEXT NOT NULL DEFAULT '[]',
    objetivos_json TEXT NOT NULL DEFAULT '[]',
    orgaos_json TEXT NOT NULL DEFAULT '[]',
    atributo_condicionante INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS ncm_attr (
    ncm_code TEXT NOT NULL,
    attr_code TEXT NOT NULL,
    modalidade TEXT NOT NULL,
    obrigatorio INTEGER NOT NULL,
    multivalorado INTEGER NOT NULL,
    data_inicio TEXT,
    data_fim TEXT,
    PRIMARY KEY (ncm_code, attr_code, modalidade)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_ncm_attr_ncm ON ncm_attr(ncm_code)`,
  `CREATE INDEX IF NOT EXISTS idx_ncm_attr_attr ON ncm_attr(attr_code)`,

  `CREATE TABLE IF NOT EXISTS conditional (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_attr_code TEXT NOT NULL,
    condition_desc TEXT NOT NULL,
    parent_operator TEXT NOT NULL,
    parent_value TEXT NOT NULL,
    child_attr_code TEXT NOT NULL,
    child_nome TEXT,
    child_nome_apresentacao TEXT,
    child_obrigatorio INTEGER NOT NULL,
    child_multivalorado INTEGER NOT NULL,
    child_forma_preenchimento TEXT,
    child_dominio_json TEXT NOT NULL DEFAULT '[]',
    child_objetivos_json TEXT NOT NULL DEFAULT '[]',
    child_orgaos_json TEXT NOT NULL DEFAULT '[]'
  )`,

  `CREATE INDEX IF NOT EXISTS idx_cond_parent ON conditional(parent_attr_code)`,

  `CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    update_run_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    ncm_code TEXT,
    attr_code TEXT,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    logged_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_changelog_run ON changelog(update_run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_changelog_ncm ON changelog(ncm_code)`,

  `CREATE TABLE IF NOT EXISTS update_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    ncm_source_ato TEXT,
    ncm_data_atualizacao TEXT,
    attr_versao INTEGER,
    ncm_count INTEGER,
    attr_count INTEGER,
    mapping_count INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS project_product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unique_id TEXT NOT NULL,
    short_desc TEXT,
    long_desc TEXT,
    extra_1 TEXT, extra_2 TEXT, extra_3 TEXT, extra_4 TEXT, extra_5 TEXT,
    ncm_code TEXT,
    ncm_description TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_prod_uniqueid ON project_product(unique_id)`,

  `CREATE TABLE IF NOT EXISTS project_attr_row (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    attr_counter INTEGER NOT NULL,
    attr_code TEXT,
    attr_name TEXT,
    attr_mandatory TEXT,
    attr_multivalued TEXT,
    attr_fill_type TEXT,
    attr_domain_values TEXT,
    attr_regulatory_body TEXT,
    attr_objective TEXT,
    attr_conditional_on TEXT,
    attr_value TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES project_product(id) ON DELETE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS idx_attr_row_product ON project_attr_row(product_id)`,

  `CREATE TABLE IF NOT EXISTS project_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`
];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add SQLite schema DDL"
```

### Task 9: Database client (worker-based)

**Files:**
- Create: `src/lib/db/worker.ts`
- Create: `src/lib/db/rpc.ts`
- Create: `src/lib/db/client.ts`
- Create: `tests/integration/db-smoke.test.ts`

- [ ] **Step 1: RPC types**

`src/lib/db/rpc.ts`:

```ts
export type DbRequest =
  | { kind: 'init' }
  | { kind: 'exec'; sql: string; params?: unknown[] }
  | { kind: 'select'; sql: string; params?: unknown[] }
  | { kind: 'bulk'; sql: string; rows: unknown[][] }
  | { kind: 'close' };

export type DbResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };
```

- [ ] **Step 2: Worker entry**

`src/lib/db/worker.ts`:

```ts
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL, SCHEMA_VERSION } from './schema';
import type { DbRequest, DbResponse } from './rpc';

let db: any = null;

async function init() {
  if (db) return;
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: console.error });
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

self.onmessage = async (ev: MessageEvent<DbRequest & { id: number }>) => {
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
    }
  } catch (e: any) {
    reply({ ok: false, error: e?.message ?? String(e) });
  }
};
```

- [ ] **Step 3: Main-thread client**

`src/lib/db/client.ts`:

```ts
import type { DbRequest, DbResponse } from './rpc';

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

  private call<T = unknown>(req: DbRequest): Promise<T> {
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
}

export const db = new DbClient();
```

- [ ] **Step 4: Integration smoke test (Node — uses in-memory SQLite)**

`tests/integration/db-smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';

describe('schema DDL', () => {
  it('creates all tables without errors', async () => {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(':memory:', 'ct');
    for (const stmt of DDL) db.exec(stmt);
    const tables = db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    const names = tables.map((r: any) => r.name);
    expect(names).toContain('ncm');
    expect(names).toContain('attribute_def');
    expect(names).toContain('ncm_attr');
    expect(names).toContain('conditional');
    expect(names).toContain('changelog');
    expect(names).toContain('project_product');
    db.close();
  });

  it('FTS index is populated by trigger', async () => {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(':memory:', 'ct');
    for (const stmt of DDL) db.exec(stmt);
    db.exec({
      sql: `INSERT INTO ncm(codigo, descricao, level) VALUES (?,?,?)`,
      bind: ['0101.21.00', 'Reprodutores de raça pura', 8]
    });
    const rows = db.selectObjects(`SELECT codigo FROM ncm_fts WHERE ncm_fts MATCH 'raca*'`);
    expect(rows).toHaveLength(1);
    db.close();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- --run tests/integration/db-smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/ tests/integration/db-smoke.test.ts
git commit -m "feat: add SQLite worker + client + schema smoke test"
```

---

_(continued in next section)_

## Phase 3 — NCM import

### Task 10: NCM parser (JSON → typed rows)

**Files:**
- Create: `src/lib/import/ncm-import.ts`
- Create: `tests/unit/ncm-import.test.ts`
- Create: `tests/fixtures/ncm-sample.json`

- [ ] **Step 1: Create fixture**

`tests/fixtures/ncm-sample.json`:

```json
{
  "Data_Ultima_Atualizacao_NCM": "Vigente em 03/04/2026",
  "Ato": "Resolução Gecex nº 812/2025",
  "Nomenclaturas": [
    { "Codigo": "01", "Descricao": "Animais vivos", "Data_Inicio": "01/01/2022", "Data_Fim": "31/12/9999", "Tipo_Ato_Ini": "Res Camex", "Numero_Ato_Ini": "272", "Ano_Ato_Ini": "2021" },
    { "Codigo": "01.01", "Descricao": "Cavalos, asininos", "Data_Inicio": "01/01/2022", "Data_Fim": "31/12/9999", "Tipo_Ato_Ini": "Res Camex", "Numero_Ato_Ini": "272", "Ano_Ato_Ini": "2021" },
    { "Codigo": "0101.21.00", "Descricao": "-- Reprodutores de raça pura", "Data_Inicio": "01/04/2022", "Data_Fim": "31/12/9999", "Tipo_Ato_Ini": "Res Camex", "Numero_Ato_Ini": "272", "Ano_Ato_Ini": "2021" },
    { "Codigo": "9999.99.99", "Descricao": "Expirado", "Data_Inicio": "01/01/2010", "Data_Fim": "01/01/2020", "Tipo_Ato_Ini": "Old", "Numero_Ato_Ini": "1", "Ano_Ato_Ini": "2010" }
  ]
}
```

- [ ] **Step 2: Write failing tests**

`tests/unit/ncm-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseNcmJson } from '../../src/lib/import/ncm-import';

describe('parseNcmJson', () => {
  const raw = readFileSync('tests/fixtures/ncm-sample.json', 'utf8');

  it('parses nomenclatura', () => {
    const { rows, meta } = parseNcmJson(raw);
    expect(rows).toHaveLength(4);
    expect(meta.ato).toBe('Resolução Gecex nº 812/2025');
    expect(meta.data_atualizacao).toBe('Vigente em 03/04/2026');
  });

  it('assigns correct level per code', () => {
    const { rows } = parseNcmJson(raw);
    const byCode = new Map(rows.map(r => [r.codigo, r]));
    expect(byCode.get('01')!.level).toBe(2);
    expect(byCode.get('01.01')!.level).toBe(4);
    expect(byCode.get('0101.21.00')!.level).toBe(8);
  });

  it('converts dates to ISO', () => {
    const { rows } = parseNcmJson(raw);
    const r = rows.find(x => x.codigo === '0101.21.00')!;
    expect(r.data_inicio).toBe('2022-04-01');
    expect(r.data_fim).toBe('9999-12-31');
  });

  it('throws on malformed input', () => {
    expect(() => parseNcmJson('{}')).toThrow();
  });
});
```

- [ ] **Step 3: Verify failure**

```bash
npm run test -- --run tests/unit/ncm-import.test.ts
```

- [ ] **Step 4: Implement**

`src/lib/import/ncm-import.ts`:

```ts
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
```

- [ ] **Step 5: Tests pass**

```bash
npm run test -- --run tests/unit/ncm-import.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/ncm-import.ts tests/unit/ncm-import.test.ts tests/fixtures/ncm-sample.json
git commit -m "feat: add NCM JSON parser"
```

### Task 11: NCM DB writer (shadow-table + swap)

**Files:**
- Create: `src/lib/import/ncm-writer.ts`
- Create: `tests/integration/ncm-writer.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/ncm-writer.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { writeNcmRows } from '../../src/lib/import/ncm-writer';
import type { NcmRow } from '../../src/lib/types';

async function freshDb() {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new sqlite3.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

const sampleRows: NcmRow[] = [
  { codigo: '01', descricao: 'Animais', level: 2, data_inicio: '2022-01-01', data_fim: '9999-12-31', tipo_ato_ini: 'R', numero_ato_ini: '1', ano_ato_ini: '2022' },
  { codigo: '0101.21.00', descricao: 'Reprodutores', level: 8, data_inicio: '2022-04-01', data_fim: '9999-12-31', tipo_ato_ini: 'R', numero_ato_ini: '1', ano_ato_ini: '2022' }
];

describe('writeNcmRows', () => {
  it('inserts rows', async () => {
    const db = await freshDb();
    writeNcmRows(db, sampleRows);
    const cnt = db.selectValue('SELECT COUNT(*) FROM ncm');
    expect(cnt).toBe(2);
    db.close();
  });

  it('FTS populated for inserted rows', async () => {
    const db = await freshDb();
    writeNcmRows(db, sampleRows);
    const r = db.selectObjects(`SELECT codigo FROM ncm_fts WHERE ncm_fts MATCH 'reproduto*'`);
    expect(r).toHaveLength(1);
    db.close();
  });

  it('replaces prior rows (idempotent)', async () => {
    const db = await freshDb();
    writeNcmRows(db, sampleRows);
    writeNcmRows(db, [{ ...sampleRows[0], descricao: 'Changed' }]);
    const row = db.selectObjects(`SELECT descricao FROM ncm WHERE codigo='01'`);
    expect((row[0] as any).descricao).toBe('Changed');
    const cnt = db.selectValue('SELECT COUNT(*) FROM ncm');
    expect(cnt).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npm run test -- --run tests/integration/ncm-writer.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/import/ncm-writer.ts`:

```ts
import type { NcmRow } from '../types';

export function writeNcmRows(db: any, rows: NcmRow[]): void {
  db.transaction(() => {
    db.exec('DELETE FROM ncm');
    const stmt = db.prepare(
      `INSERT INTO ncm(codigo, descricao, level, data_inicio, data_fim, tipo_ato_ini, numero_ato_ini, ano_ato_ini)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    try {
      for (const r of rows) {
        stmt.bind([r.codigo, r.descricao, r.level, r.data_inicio, r.data_fim,
                   r.tipo_ato_ini, r.numero_ato_ini, r.ano_ato_ini]).stepReset();
      }
    } finally { stmt.finalize(); }
  });
}
```

- [ ] **Step 4: Tests pass**

```bash
npm run test -- --run tests/integration/ncm-writer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/ncm-writer.ts tests/integration/ncm-writer.test.ts
git commit -m "feat: add NCM DB writer with idempotent replace"
```

### Task 12: NCM diff engine

**Files:**
- Create: `src/lib/import/diff-engine.ts`
- Create: `tests/unit/diff-engine.test.ts`

- [ ] **Step 1: Failing tests**

`tests/unit/diff-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffNcmRows } from '../../src/lib/import/diff-engine';
import type { NcmRow } from '../../src/lib/types';

const base = (codigo: string, over: Partial<NcmRow> = {}): NcmRow => ({
  codigo, descricao: `desc ${codigo}`, level: 8,
  data_inicio: '2022-01-01', data_fim: '9999-12-31',
  tipo_ato_ini: 'R', numero_ato_ini: '1', ano_ato_ini: '2022',
  ...over
});

describe('diffNcmRows', () => {
  it('detects ADDED', () => {
    const changes = diffNcmRows([], [base('0101.21.00')], 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe('NCM_ADDED');
    expect(changes[0].ncm_code).toBe('0101.21.00');
    expect(changes[0].new_value).toContain('0101.21.00');
  });

  it('detects REMOVED', () => {
    const changes = diffNcmRows([base('9999.99.99')], [], 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe('NCM_REMOVED');
  });

  it('detects MODIFIED per field', () => {
    const old = [base('0101.21.00', { descricao: 'Old desc' })];
    const now = [base('0101.21.00', { descricao: 'New desc' })];
    const changes = diffNcmRows(old, now, 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(1);
    expect(changes[0].change_type).toBe('NCM_MODIFIED');
    expect(changes[0].field_changed).toBe('descricao');
    expect(changes[0].old_value).toBe('Old desc');
    expect(changes[0].new_value).toBe('New desc');
  });

  it('emits one entry per changed field', () => {
    const old = [base('0101.21.00', { descricao: 'A', data_fim: '9999-12-31' })];
    const now = [base('0101.21.00', { descricao: 'B', data_fim: '2030-12-31' })];
    const changes = diffNcmRows(old, now, 1, '2026-04-18T00:00:00Z');
    expect(changes).toHaveLength(2);
    const fields = changes.map(c => c.field_changed).sort();
    expect(fields).toEqual(['data_fim', 'descricao']);
  });

  it('produces no changes when inputs are identical', () => {
    const rows = [base('0101.21.00')];
    expect(diffNcmRows(rows, rows, 1, '2026-04-18T00:00:00Z')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
npm run test -- --run tests/unit/diff-engine.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/import/diff-engine.ts`:

```ts
import type { NcmRow, ChangelogEntry } from '../types';

const NCM_FIELDS: (keyof NcmRow)[] = [
  'descricao', 'level', 'data_inicio', 'data_fim',
  'tipo_ato_ini', 'numero_ato_ini', 'ano_ato_ini'
];

export function diffNcmRows(
  oldRows: NcmRow[],
  newRows: NcmRow[],
  runId: number,
  loggedAt: string
): ChangelogEntry[] {
  const oldMap = new Map(oldRows.map(r => [r.codigo, r]));
  const newMap = new Map(newRows.map(r => [r.codigo, r]));
  const entries: ChangelogEntry[] = [];

  for (const [code, row] of newMap) {
    if (!oldMap.has(code)) {
      entries.push({
        update_run_id: runId,
        change_type: 'NCM_ADDED',
        ncm_code: code,
        attr_code: null,
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(row)
      });
    }
  }
  for (const [code, row] of oldMap) {
    if (!newMap.has(code)) {
      entries.push({
        update_run_id: runId,
        change_type: 'NCM_REMOVED',
        ncm_code: code,
        attr_code: null,
        field_changed: null,
        old_value: JSON.stringify(row),
        new_value: null
      });
    } else {
      const n = newMap.get(code)!;
      for (const f of NCM_FIELDS) {
        if (row[f] !== n[f]) {
          entries.push({
            update_run_id: runId,
            change_type: 'NCM_MODIFIED',
            ncm_code: code,
            attr_code: null,
            field_changed: f,
            old_value: String(row[f] ?? ''),
            new_value: String(n[f] ?? '')
          });
        }
      }
    }
  }
  return entries;
}
```

- [ ] **Step 4: Tests pass**

```bash
npm run test -- --run tests/unit/diff-engine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/diff-engine.ts tests/unit/diff-engine.test.ts
git commit -m "feat: add NCM diff engine"
```

### Task 13: End-to-end NCM import orchestrator

**Files:**
- Create: `src/lib/import/ncm-orchestrator.ts`
- Create: `tests/integration/ncm-orchestrator.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/ncm-orchestrator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importNcm } from '../../src/lib/import/ncm-orchestrator';

async function freshDb() {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new sqlite3.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

describe('importNcm', () => {
  const raw = readFileSync('tests/fixtures/ncm-sample.json', 'utf8');

  it('first import creates no changelog entries', async () => {
    const db = await freshDb();
    const runId = await importNcm(db, raw, '2026-04-18T00:00:00Z');
    const clog = db.selectValue('SELECT COUNT(*) FROM changelog WHERE update_run_id = ?', [runId]);
    expect(clog).toBe(0);
    const ncm = db.selectValue('SELECT COUNT(*) FROM ncm');
    expect(ncm).toBe(4);
  });

  it('second import with changes logs diffs', async () => {
    const db = await freshDb();
    await importNcm(db, raw, '2026-04-18T00:00:00Z');
    const modified = raw.replace('Reprodutores de raça pura', 'Reprodutores de raça MIXED');
    const runId = await importNcm(db, modified, '2026-04-19T00:00:00Z');
    const entries = db.selectObjects(`SELECT change_type, field_changed FROM changelog WHERE update_run_id = ?`, [runId]);
    expect(entries.length).toBeGreaterThan(0);
    expect((entries[0] as any).change_type).toBe('NCM_MODIFIED');
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/import/ncm-orchestrator.ts`:

```ts
import { parseNcmJson } from './ncm-import';
import { writeNcmRows } from './ncm-writer';
import { diffNcmRows } from './diff-engine';
import type { NcmRow } from '../types';

export async function importNcm(db: any, rawJson: string, loggedAt: string): Promise<number> {
  const { rows, meta } = parseNcmJson(rawJson);
  const existingRows: NcmRow[] = db.selectObjects(
    `SELECT codigo, descricao, level, data_inicio, data_fim, tipo_ato_ini, numero_ato_ini, ano_ato_ini FROM ncm`
  );
  const firstImport = existingRows.length === 0;

  db.exec({
    sql: `INSERT INTO update_run(run_at, ncm_source_ato, ncm_data_atualizacao, ncm_count)
          VALUES (?,?,?,?)`,
    bind: [loggedAt, meta.ato, meta.data_atualizacao, rows.length]
  });
  const runId = db.selectValue(`SELECT last_insert_rowid()`) as number;

  writeNcmRows(db, rows);

  if (!firstImport) {
    const entries = diffNcmRows(existingRows, rows, runId, loggedAt);
    db.transaction(() => {
      const stmt = db.prepare(
        `INSERT INTO changelog(update_run_id, change_type, ncm_code, attr_code, field_changed, old_value, new_value, logged_at)
         VALUES (?,?,?,?,?,?,?,?)`
      );
      try {
        for (const e of entries) {
          stmt.bind([e.update_run_id, e.change_type, e.ncm_code, e.attr_code, e.field_changed, e.old_value, e.new_value, loggedAt]).stepReset();
        }
      } finally { stmt.finalize(); }
    });
  }
  return runId;
}
```

- [ ] **Step 3: Tests pass**

```bash
npm run test -- --run tests/integration/ncm-orchestrator.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/import/ncm-orchestrator.ts tests/integration/ncm-orchestrator.test.ts
git commit -m "feat: add NCM import orchestrator with changelog"
```

---

## Phase 4 — Attributes import

### Task 14: Attribute JSON parser

**Files:**
- Create: `src/lib/import/attr-import.ts`
- Create: `tests/unit/attr-import.test.ts`
- Create: `tests/fixtures/attrs-sample.json`

- [ ] **Step 1: Create fixture**

`tests/fixtures/attrs-sample.json`:

```json
{
  "versao": 282,
  "listaNcm": [
    {
      "codigoNcm": "0101.21.00",
      "listaAtributos": [
        { "codigo": "ATT_9332", "modalidade": "Importação", "obrigatorio": true, "multivalorado": false, "dataInicioVigencia": "2023-11-06", "dataFimVigencia": "9999-12-31" },
        { "codigo": "ATT_12960", "modalidade": "Importação", "obrigatorio": false, "multivalorado": false, "dataInicioVigencia": "2024-11-13", "dataFimVigencia": "9999-12-31" }
      ]
    }
  ],
  "detalhesAtributos": [
    {
      "codigo": "ATT_9332",
      "nome": "Material", "nomeApresentacao": "Material de fabricação", "definicao": "Material do produto", "orientacaoPreenchimento": "Selecione",
      "formaPreenchimento": "LISTA_ESTATICA", "dataInicioVigencia": "2023-11-06", "dataFimVigencia": "",
      "dominio": [{"codigo":"01","descricao":"Aço"},{"codigo":"02","descricao":"Alumínio"}],
      "objetivos": [{"codigo":"01","descricao":"Produto"}],
      "orgaos": ["INMETRO"],
      "atributoCondicionante": true,
      "condicionados": [
        {
          "codigo": "ATT_9999", "nome": "Specify", "nomeApresentacao": "Especificar outro",
          "obrigatorio": true, "multivalorado": false, "formaPreenchimento": "TEXTO",
          "dataInicioVigencia": "2023-11-06", "dataFimVigencia": "9999-12-31",
          "dominio": [], "objetivos": [], "orgaos": ["INMETRO"],
          "descricao": "'ATT_9332' Igual '999'"
        }
      ]
    },
    {
      "codigo": "ATT_12960",
      "nome": "Destaque", "nomeApresentacao": "Destaque vaso de pressão", "definicao": "", "orientacaoPreenchimento": "",
      "formaPreenchimento": "BOOLEANO", "dataInicioVigencia": "2024-11-13", "dataFimVigencia": "",
      "dominio": [], "objetivos": [], "orgaos": ["INMETRO"],
      "atributoCondicionante": false, "condicionados": null
    }
  ]
}
```

- [ ] **Step 2: Failing tests**

`tests/unit/attr-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAttrJson } from '../../src/lib/import/attr-import';

describe('parseAttrJson', () => {
  const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');

  it('extracts versao', () => {
    const p = parseAttrJson(raw);
    expect(p.versao).toBe(282);
  });

  it('extracts mappings', () => {
    const p = parseAttrJson(raw);
    expect(p.mappings).toHaveLength(2);
    const m = p.mappings.find(x => x.attr_code === 'ATT_9332')!;
    expect(m.ncm_code).toBe('0101.21.00');
    expect(m.obrigatorio).toBe(true);
  });

  it('extracts attribute definitions', () => {
    const p = parseAttrJson(raw);
    expect(p.defs).toHaveLength(2);
    const d = p.defs.find(x => x.codigo === 'ATT_9332')!;
    expect(d.nome_apresentacao).toBe('Material de fabricação');
    expect(d.forma_preenchimento).toBe('LISTA_ESTATICA');
    expect(d.dominio).toHaveLength(2);
    expect(d.atributo_condicionante).toBe(true);
  });

  it('extracts conditional rules from condicionados', () => {
    const p = parseAttrJson(raw);
    expect(p.conditionals).toHaveLength(1);
    const c = p.conditionals[0];
    expect(c.parent_attr_code).toBe('ATT_9332');
    expect(c.child_attr_code).toBe('ATT_9999');
    expect(c.parent_operator).toBe('EQ');
    expect(c.parent_value).toBe('999');
  });
});
```

- [ ] **Step 3: Verify failure**

```bash
npm run test -- --run tests/unit/attr-import.test.ts
```

- [ ] **Step 4: Implement**

`src/lib/import/attr-import.ts`:

```ts
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
```

- [ ] **Step 5: Tests pass**

```bash
npm run test -- --run tests/unit/attr-import.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/attr-import.ts tests/unit/attr-import.test.ts tests/fixtures/attrs-sample.json
git commit -m "feat: add attributes JSON parser"
```

### Task 15: ZIP decompression wrapper

**Files:**
- Create: `src/lib/import/unzip.ts`
- Create: `tests/unit/unzip.test.ts`

- [ ] **Step 1: Failing test**

`tests/unit/unzip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractSingleJson } from '../../src/lib/import/unzip';

describe('extractSingleJson', () => {
  it('extracts the only file in a zip', () => {
    const json = '{"hello":"world"}';
    const zipped = zipSync({ 'data.json': strToU8(json) });
    const out = extractSingleJson(zipped);
    expect(out).toBe(json);
  });

  it('throws if zip has no files', () => {
    const zipped = zipSync({});
    expect(() => extractSingleJson(zipped)).toThrow();
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/import/unzip.ts`:

```ts
import { unzipSync, strFromU8 } from 'fflate';

export function extractSingleJson(data: Uint8Array): string {
  const files = unzipSync(data);
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('ZIP contains no files');
  const jsonName = names.find(n => n.toLowerCase().endsWith('.json')) ?? names[0];
  return strFromU8(files[jsonName]);
}
```

- [ ] **Step 3: Tests pass**

```bash
npm run test -- --run tests/unit/unzip.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/import/unzip.ts tests/unit/unzip.test.ts
git commit -m "feat: add ZIP extraction for single-file attribute archives"
```

### Task 16: Attribute DB writer

**Files:**
- Create: `src/lib/import/attr-writer.ts`
- Create: `tests/integration/attr-writer.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/attr-writer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { parseAttrJson } from '../../src/lib/import/attr-import';
import { writeAttributes } from '../../src/lib/import/attr-writer';

async function freshDb() {
  const s = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

describe('writeAttributes', () => {
  it('inserts defs, mappings, conditionals', async () => {
    const db = await freshDb();
    const parsed = parseAttrJson(readFileSync('tests/fixtures/attrs-sample.json', 'utf8'));
    writeAttributes(db, parsed);
    expect(db.selectValue('SELECT COUNT(*) FROM attribute_def')).toBe(2);
    expect(db.selectValue('SELECT COUNT(*) FROM ncm_attr')).toBe(2);
    expect(db.selectValue('SELECT COUNT(*) FROM conditional')).toBe(1);
  });

  it('stores domain as JSON', async () => {
    const db = await freshDb();
    const parsed = parseAttrJson(readFileSync('tests/fixtures/attrs-sample.json', 'utf8'));
    writeAttributes(db, parsed);
    const row = db.selectObjects(`SELECT dominio_json FROM attribute_def WHERE codigo='ATT_9332'`)[0] as any;
    const dom = JSON.parse(row.dominio_json);
    expect(dom).toHaveLength(2);
  });

  it('is idempotent', async () => {
    const db = await freshDb();
    const parsed = parseAttrJson(readFileSync('tests/fixtures/attrs-sample.json', 'utf8'));
    writeAttributes(db, parsed);
    writeAttributes(db, parsed);
    expect(db.selectValue('SELECT COUNT(*) FROM attribute_def')).toBe(2);
    expect(db.selectValue('SELECT COUNT(*) FROM conditional')).toBe(1);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/import/attr-writer.ts`:

```ts
import type { ParsedAttrs } from './attr-import';

export function writeAttributes(db: any, parsed: ParsedAttrs): void {
  db.transaction(() => {
    db.exec('DELETE FROM conditional');
    db.exec('DELETE FROM ncm_attr');
    db.exec('DELETE FROM attribute_def');

    const defStmt = db.prepare(
      `INSERT INTO attribute_def(codigo, nome, nome_apresentacao, definicao, orientacao_preenchimento,
         forma_preenchimento, data_inicio, data_fim, dominio_json, objetivos_json, orgaos_json, atributo_condicionante)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    try {
      for (const d of parsed.defs) {
        defStmt.bind([
          d.codigo, d.nome, d.nome_apresentacao, d.definicao, d.orientacao_preenchimento,
          d.forma_preenchimento, d.data_inicio, d.data_fim,
          JSON.stringify(d.dominio), JSON.stringify(d.objetivos), JSON.stringify(d.orgaos),
          d.atributo_condicionante ? 1 : 0
        ]).stepReset();
      }
    } finally { defStmt.finalize(); }

    const mapStmt = db.prepare(
      `INSERT INTO ncm_attr(ncm_code, attr_code, modalidade, obrigatorio, multivalorado, data_inicio, data_fim)
       VALUES (?,?,?,?,?,?,?)`
    );
    try {
      for (const m of parsed.mappings) {
        mapStmt.bind([m.ncm_code, m.attr_code, m.modalidade,
                      m.obrigatorio ? 1 : 0, m.multivalorado ? 1 : 0,
                      m.data_inicio, m.data_fim]).stepReset();
      }
    } finally { mapStmt.finalize(); }

    const condStmt = db.prepare(
      `INSERT INTO conditional(parent_attr_code, condition_desc, parent_operator, parent_value,
         child_attr_code, child_nome, child_nome_apresentacao, child_obrigatorio, child_multivalorado,
         child_forma_preenchimento, child_dominio_json, child_objetivos_json, child_orgaos_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    try {
      for (const c of parsed.conditionals) {
        condStmt.bind([
          c.parent_attr_code, c.condition_desc, c.parent_operator, c.parent_value,
          c.child_attr_code, c.child_nome, c.child_nome_apresentacao,
          c.child_obrigatorio ? 1 : 0, c.child_multivalorado ? 1 : 0,
          c.child_forma_preenchimento,
          JSON.stringify(c.child_dominio),
          JSON.stringify(c.child_objetivos),
          JSON.stringify(c.child_orgaos)
        ]).stepReset();
      }
    } finally { condStmt.finalize(); }
  });
}
```

- [ ] **Step 3: Tests pass**

```bash
npm run test -- --run tests/integration/attr-writer.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/import/attr-writer.ts tests/integration/attr-writer.test.ts
git commit -m "feat: add attributes DB writer"
```

### Task 17: Attribute diff engine

**Files:**
- Create: `src/lib/import/attr-diff.ts`
- Create: `tests/unit/attr-diff.test.ts`

- [ ] **Step 1: Failing tests**

`tests/unit/attr-diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffAttributes } from '../../src/lib/import/attr-diff';
import type { ParsedAttrs } from '../../src/lib/import/attr-import';

const mk = (overrides: Partial<ParsedAttrs> = {}): ParsedAttrs => ({
  versao: 1, defs: [], mappings: [], conditionals: [], ...overrides
});

describe('diffAttributes', () => {
  it('detects ATTR_DEF_ADDED', () => {
    const old = mk();
    const now = mk({ defs: [{
      codigo: 'A', nome: 'N', nome_apresentacao: 'NA', definicao: '', orientacao_preenchimento: '',
      forma_preenchimento: 'TEXTO', data_inicio: '', data_fim: '',
      dominio: [], objetivos: [], orgaos: [], atributo_condicionante: false
    }]});
    const e = diffAttributes(old, now, 1, '2026-04-18T00:00:00Z');
    expect(e.filter(x => x.change_type === 'ATTR_DEF_ADDED')).toHaveLength(1);
  });

  it('detects DOMAIN_VALUE_ADDED when domain list grows', () => {
    const base = {
      codigo: 'A', nome: '', nome_apresentacao: '', definicao: '', orientacao_preenchimento: '',
      forma_preenchimento: 'LISTA_ESTATICA' as const, data_inicio: '', data_fim: '',
      objetivos: [], orgaos: [], atributo_condicionante: false
    };
    const old = mk({ defs: [{ ...base, dominio: [{codigo:'01', descricao:'A'}] }] });
    const now = mk({ defs: [{ ...base, dominio: [{codigo:'01', descricao:'A'}, {codigo:'02', descricao:'B'}] }] });
    const e = diffAttributes(old, now, 1, '2026-04-18T00:00:00Z');
    const added = e.filter(x => x.change_type === 'DOMAIN_VALUE_ADDED');
    expect(added).toHaveLength(1);
    expect(added[0].new_value).toContain('02');
  });

  it('detects MAP_ADDED and MAP_REMOVED', () => {
    const old = mk({ mappings: [{ ncm_code: 'X', attr_code: 'A', modalidade: 'Importação', obrigatorio: true, multivalorado: false, data_inicio: '', data_fim: '' }] });
    const now = mk({ mappings: [{ ncm_code: 'X', attr_code: 'B', modalidade: 'Importação', obrigatorio: true, multivalorado: false, data_inicio: '', data_fim: '' }] });
    const e = diffAttributes(old, now, 1, '2026-04-18T00:00:00Z');
    expect(e.some(x => x.change_type === 'MAP_ADDED' && x.attr_code === 'B')).toBe(true);
    expect(e.some(x => x.change_type === 'MAP_REMOVED' && x.attr_code === 'A')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/import/attr-diff.ts`:

```ts
import type { ChangelogEntry, AttributeDef, NcmAttrMapping, ConditionalRule, DomainValue } from '../types';
import type { ParsedAttrs } from './attr-import';

const DEF_FIELDS: (keyof AttributeDef)[] = [
  'nome', 'nome_apresentacao', 'definicao', 'orientacao_preenchimento',
  'forma_preenchimento', 'data_inicio', 'data_fim', 'atributo_condicionante'
];
const MAP_FIELDS: (keyof NcmAttrMapping)[] = ['obrigatorio', 'multivalorado', 'data_inicio', 'data_fim'];

const mapKey = (m: NcmAttrMapping) => `${m.ncm_code}|${m.attr_code}|${m.modalidade}`;
const condKey = (c: ConditionalRule) => `${c.parent_attr_code}|${c.child_attr_code}|${c.condition_desc}`;

function diffDomain(
  attrCode: string, oldDom: DomainValue[], newDom: DomainValue[],
  runId: number, loggedAt: string
): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  const oldMap = new Map(oldDom.map(d => [d.codigo, d]));
  const newMap = new Map(newDom.map(d => [d.codigo, d]));
  for (const [c, v] of newMap) {
    if (!oldMap.has(c)) out.push({
      update_run_id: runId, change_type: 'DOMAIN_VALUE_ADDED',
      ncm_code: null, attr_code: attrCode, field_changed: c,
      old_value: null, new_value: JSON.stringify(v)
    });
  }
  for (const [c, v] of oldMap) {
    if (!newMap.has(c)) out.push({
      update_run_id: runId, change_type: 'DOMAIN_VALUE_REMOVED',
      ncm_code: null, attr_code: attrCode, field_changed: c,
      old_value: JSON.stringify(v), new_value: null
    });
    else {
      const n = newMap.get(c)!;
      if (n.descricao !== v.descricao) out.push({
        update_run_id: runId, change_type: 'DOMAIN_VALUE_MODIFIED',
        ncm_code: null, attr_code: attrCode, field_changed: c,
        old_value: v.descricao, new_value: n.descricao
      });
    }
  }
  return out;
}

export function diffAttributes(
  oldP: ParsedAttrs, newP: ParsedAttrs, runId: number, loggedAt: string
): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];

  const oldDefs = new Map(oldP.defs.map(d => [d.codigo, d]));
  const newDefs = new Map(newP.defs.map(d => [d.codigo, d]));
  for (const [code, d] of newDefs) {
    if (!oldDefs.has(code)) out.push({
      update_run_id: runId, change_type: 'ATTR_DEF_ADDED', ncm_code: null,
      attr_code: code, field_changed: null, old_value: null, new_value: JSON.stringify(d)
    });
  }
  for (const [code, d] of oldDefs) {
    if (!newDefs.has(code)) {
      out.push({
        update_run_id: runId, change_type: 'ATTR_DEF_REMOVED', ncm_code: null,
        attr_code: code, field_changed: null, old_value: JSON.stringify(d), new_value: null
      });
    } else {
      const n = newDefs.get(code)!;
      for (const f of DEF_FIELDS) {
        if (d[f] !== n[f]) out.push({
          update_run_id: runId, change_type: 'ATTR_DEF_MODIFIED', ncm_code: null,
          attr_code: code, field_changed: f as string,
          old_value: String(d[f] ?? ''), new_value: String(n[f] ?? '')
        });
      }
      out.push(...diffDomain(code, d.dominio, n.dominio, runId, loggedAt));
    }
  }

  const oldMap = new Map(oldP.mappings.map(m => [mapKey(m), m]));
  const newMap = new Map(newP.mappings.map(m => [mapKey(m), m]));
  for (const [k, m] of newMap) {
    if (!oldMap.has(k)) out.push({
      update_run_id: runId, change_type: 'MAP_ADDED',
      ncm_code: m.ncm_code, attr_code: m.attr_code, field_changed: null,
      old_value: null, new_value: JSON.stringify(m)
    });
  }
  for (const [k, m] of oldMap) {
    if (!newMap.has(k)) out.push({
      update_run_id: runId, change_type: 'MAP_REMOVED',
      ncm_code: m.ncm_code, attr_code: m.attr_code, field_changed: null,
      old_value: JSON.stringify(m), new_value: null
    });
    else {
      const n = newMap.get(k)!;
      for (const f of MAP_FIELDS) {
        if (m[f] !== n[f]) out.push({
          update_run_id: runId, change_type: 'MAP_MODIFIED',
          ncm_code: m.ncm_code, attr_code: m.attr_code, field_changed: f as string,
          old_value: String(m[f] ?? ''), new_value: String(n[f] ?? '')
        });
      }
    }
  }

  const oldCond = new Map(oldP.conditionals.map(c => [condKey(c), c]));
  const newCond = new Map(newP.conditionals.map(c => [condKey(c), c]));
  for (const [k, c] of newCond) {
    if (!oldCond.has(k)) out.push({
      update_run_id: runId, change_type: 'COND_ADDED',
      ncm_code: null, attr_code: c.parent_attr_code, field_changed: c.child_attr_code,
      old_value: null, new_value: JSON.stringify(c)
    });
  }
  for (const [k, c] of oldCond) {
    if (!newCond.has(k)) out.push({
      update_run_id: runId, change_type: 'COND_REMOVED',
      ncm_code: null, attr_code: c.parent_attr_code, field_changed: c.child_attr_code,
      old_value: JSON.stringify(c), new_value: null
    });
  }
  return out;
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/unit/attr-diff.test.ts
git add src/lib/import/attr-diff.ts tests/unit/attr-diff.test.ts
git commit -m "feat: add attributes diff engine including domain-value diffs"
```

### Task 18: Attribute import orchestrator

**Files:**
- Create: `src/lib/import/attr-orchestrator.ts`
- Create: `tests/integration/attr-orchestrator.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/attr-orchestrator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importAttributes } from '../../src/lib/import/attr-orchestrator';

async function freshDb() {
  const s = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  return db;
}

describe('importAttributes', () => {
  it('first import logs no changelog entries', async () => {
    const db = await freshDb();
    const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
    const zipped = zipSync({ 'data.json': strToU8(raw) });
    const runId = await importAttributes(db, zipped, '2026-04-18T00:00:00Z');
    expect(db.selectValue('SELECT COUNT(*) FROM changelog WHERE update_run_id=?', [runId])).toBe(0);
    expect(db.selectValue('SELECT COUNT(*) FROM attribute_def')).toBe(2);
  });

  it('second import with domain change logs it', async () => {
    const db = await freshDb();
    const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
    await importAttributes(db, zipSync({ 'data.json': strToU8(raw) }), '2026-04-18T00:00:00Z');
    const modified = raw.replace('"Aço"', '"Aço carbono"');
    const runId = await importAttributes(db, zipSync({ 'data.json': strToU8(modified) }), '2026-04-19T00:00:00Z');
    const entries = db.selectObjects(`SELECT change_type FROM changelog WHERE update_run_id=?`, [runId]);
    expect(entries.some((e: any) => e.change_type === 'DOMAIN_VALUE_MODIFIED')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/import/attr-orchestrator.ts`:

```ts
import { extractSingleJson } from './unzip';
import { parseAttrJson, type ParsedAttrs } from './attr-import';
import { writeAttributes } from './attr-writer';
import { diffAttributes } from './attr-diff';

export async function importAttributes(db: any, zipData: Uint8Array, loggedAt: string): Promise<number> {
  const rawJson = extractSingleJson(zipData);
  const parsed = parseAttrJson(rawJson);

  const oldDefs = db.selectObjects(
    `SELECT codigo, nome, nome_apresentacao, definicao, orientacao_preenchimento,
            forma_preenchimento, data_inicio, data_fim, dominio_json, objetivos_json, orgaos_json, atributo_condicionante
     FROM attribute_def`
  );
  const oldMappings = db.selectObjects(`SELECT * FROM ncm_attr`);
  const oldCond = db.selectObjects(`SELECT * FROM conditional`);

  const firstImport = oldDefs.length === 0;
  const oldParsed: ParsedAttrs = {
    versao: 0,
    defs: oldDefs.map((r: any) => ({
      codigo: r.codigo, nome: r.nome, nome_apresentacao: r.nome_apresentacao,
      definicao: r.definicao, orientacao_preenchimento: r.orientacao_preenchimento,
      forma_preenchimento: r.forma_preenchimento, data_inicio: r.data_inicio, data_fim: r.data_fim,
      dominio: JSON.parse(r.dominio_json || '[]'),
      objetivos: JSON.parse(r.objetivos_json || '[]'),
      orgaos: JSON.parse(r.orgaos_json || '[]'),
      atributo_condicionante: !!r.atributo_condicionante
    })),
    mappings: oldMappings.map((r: any) => ({
      ncm_code: r.ncm_code, attr_code: r.attr_code, modalidade: r.modalidade,
      obrigatorio: !!r.obrigatorio, multivalorado: !!r.multivalorado,
      data_inicio: r.data_inicio, data_fim: r.data_fim
    })),
    conditionals: oldCond.map((r: any) => ({
      parent_attr_code: r.parent_attr_code, condition_desc: r.condition_desc,
      parent_operator: r.parent_operator, parent_value: r.parent_value,
      child_attr_code: r.child_attr_code, child_nome: r.child_nome,
      child_nome_apresentacao: r.child_nome_apresentacao,
      child_obrigatorio: !!r.child_obrigatorio, child_multivalorado: !!r.child_multivalorado,
      child_forma_preenchimento: r.child_forma_preenchimento,
      child_dominio: JSON.parse(r.child_dominio_json || '[]'),
      child_objetivos: JSON.parse(r.child_objetivos_json || '[]'),
      child_orgaos: JSON.parse(r.child_orgaos_json || '[]')
    }))
  };

  db.exec({
    sql: `INSERT INTO update_run(run_at, attr_versao, attr_count, mapping_count) VALUES (?,?,?,?)`,
    bind: [loggedAt, parsed.versao, parsed.defs.length, parsed.mappings.length]
  });
  const runId = db.selectValue(`SELECT last_insert_rowid()`) as number;

  writeAttributes(db, parsed);

  if (!firstImport) {
    const entries = diffAttributes(oldParsed, parsed, runId, loggedAt);
    db.transaction(() => {
      const stmt = db.prepare(
        `INSERT INTO changelog(update_run_id, change_type, ncm_code, attr_code, field_changed, old_value, new_value, logged_at)
         VALUES (?,?,?,?,?,?,?,?)`
      );
      try {
        for (const e of entries) {
          stmt.bind([e.update_run_id, e.change_type, e.ncm_code, e.attr_code, e.field_changed, e.old_value, e.new_value, loggedAt]).stepReset();
        }
      } finally { stmt.finalize(); }
    });
  }
  return runId;
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/integration/attr-orchestrator.test.ts
git add src/lib/import/attr-orchestrator.ts tests/integration/attr-orchestrator.test.ts
git commit -m "feat: add attributes import orchestrator with changelog"
```

---

## Phase 5 — Core logic: search

### Task 19: NCM search service

**Files:**
- Create: `src/lib/core/search.ts`
- Create: `tests/integration/search.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/search.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { searchNcm } from '../../src/lib/core/search';
import { writeNcmRows } from '../../src/lib/import/ncm-writer';

const rows = [
  { codigo: '01', descricao: 'Animais vivos', level: 2, data_inicio: null, data_fim: null, tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null },
  { codigo: '0101.21.00', descricao: 'Reprodutores de raça pura', level: 8, data_inicio: null, data_fim: null, tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null },
  { codigo: '7304.19.00', descricao: 'Tubos de aço sem costura', level: 8, data_inicio: null, data_fim: null, tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null }
] as any;

async function db() {
  const s = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const d = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) d.exec(stmt);
  writeNcmRows(d, rows);
  return d;
}

describe('searchNcm', () => {
  it('returns AND-matched results ignoring diacritics', async () => {
    const d = await db();
    const r = searchNcm(d, 'raca pura');
    expect(r).toHaveLength(1);
    expect(r[0].codigo).toBe('0101.21.00');
  });

  it('classifiable-only excludes non-8-digit results', async () => {
    const d = await db();
    const all = searchNcm(d, 'animais', { classifiableOnly: false });
    const only = searchNcm(d, 'animais', { classifiableOnly: true });
    expect(all.length).toBeGreaterThan(only.length);
  });

  it('caps results at 100', async () => {
    const d = await db();
    const many = Array.from({ length: 200 }, (_, i) => ({
      codigo: `9${i.toString().padStart(3, '0')}.00.00`,
      descricao: `tubo item ${i}`,
      level: 8, data_inicio: null, data_fim: null,
      tipo_ato_ini: null, numero_ato_ini: null, ano_ato_ini: null
    })) as any;
    writeNcmRows(d, many);
    const r = searchNcm(d, 'tubo');
    expect(r.length).toBeLessThanOrEqual(100);
  });

  it('returns empty array on empty query', async () => {
    const d = await db();
    expect(searchNcm(d, '  ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/core/search.ts`:

```ts
export interface NcmSearchResult {
  codigo: string;
  descricao: string;
  level: number;
}

export interface SearchOptions {
  classifiableOnly?: boolean;
  limit?: number;
}

export function searchNcm(db: any, query: string, opts: SearchOptions = {}): NcmSearchResult[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const match = tokens.map(t => `${t.replace(/["*]/g, '')}*`).join(' AND ');

  const classifiableOnly = opts.classifiableOnly !== false;
  const limit = Math.min(opts.limit ?? 100, 100);

  const sql = `
    SELECT n.codigo, n.descricao, n.level
    FROM ncm_fts f
    JOIN ncm n ON n.rowid = f.rowid
    WHERE f MATCH ?
      ${classifiableOnly ? 'AND n.level = 8' : ''}
    ORDER BY f.rank, n.codigo
    LIMIT ?
  `;
  return db.selectObjects(sql, [match, limit]) as NcmSearchResult[];
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/integration/search.test.ts
git add src/lib/core/search.ts tests/integration/search.test.ts
git commit -m "feat: add NCM FTS5 search service"
```

---

## Phase 6 — Core logic: attribute expansion

### Task 20: Attribute expansion

**Files:**
- Create: `src/lib/core/expansion.ts`
- Create: `tests/integration/expansion.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/expansion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importAttributes } from '../../src/lib/import/attr-orchestrator';
import { expandAttributesForProduct } from '../../src/lib/core/expansion';

async function seed() {
  const s = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
  await importAttributes(db, zipSync({ 'data.json': strToU8(raw) }), '2026-04-18T00:00:00Z');
  db.exec({
    sql: `INSERT INTO project_product(id, unique_id, short_desc, long_desc, ncm_code, ncm_description)
          VALUES (1, 'P1', 'test', 'test long', '0101.21.00', 'Reprodutores de raça pura')`
  });
  return db;
}

describe('expandAttributesForProduct', () => {
  it('creates base rows for each mapped attribute', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    const rows = db.selectObjects(`SELECT attr_code, attr_name, attr_fill_type, source FROM project_attr_row WHERE product_id=1 ORDER BY attr_counter`);
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.source === 'base')).toBe(true);
    expect((rows[0] as any).attr_name).toBe('Material de fabricação');
  });

  it('serializes LISTA_ESTATICA domain', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    const r = db.selectObjects(`SELECT attr_domain_values FROM project_attr_row WHERE attr_code='ATT_9332'`)[0] as any;
    expect(r.attr_domain_values).toBe('01 - Aço; 02 - Alumínio');
  });

  it('mandatoryOnly=true filters out non-mandatory', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: true, excludedAttrs: [], today: '2026-04-18' });
    const codes = (db.selectObjects(`SELECT attr_code FROM project_attr_row WHERE product_id=1`) as any[]).map(r => r.attr_code);
    expect(codes).toEqual(['ATT_9332']);
  });

  it('excludedAttrs removes those codes', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: ['ATT_9332'], today: '2026-04-18' });
    const codes = (db.selectObjects(`SELECT attr_code FROM project_attr_row WHERE product_id=1`) as any[]).map(r => r.attr_code);
    expect(codes).toEqual(['ATT_12960']);
  });

  it('produces empty_ncm placeholder when no matches', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_product SET ncm_code='9999.99.99' WHERE id=1` });
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    const rows = db.selectObjects(`SELECT source, attr_code FROM project_attr_row WHERE product_id=1`) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('empty_ncm');
    expect(rows[0].attr_code).toBeNull();
  });

  it('is idempotent (replaces prior rows for the product)', async () => {
    const db = await seed();
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
    expect(db.selectValue(`SELECT COUNT(*) FROM project_attr_row WHERE product_id=1`)).toBe(2);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/core/expansion.ts`:

```ts
import type { Modalidade } from '../types';

export interface ExpansionOptions {
  modalidades: Modalidade[];
  mandatoryOnly: boolean;
  excludedAttrs: string[];
  today: string; // ISO yyyy-mm-dd
}

function serializeDomain(dominioJson: string): string {
  try {
    const arr = JSON.parse(dominioJson) as { codigo: string; descricao: string }[];
    return arr.map(d => `${d.codigo} - ${d.descricao}`).join('; ');
  } catch {
    return '';
  }
}

function serializeOrgaos(json: string): string {
  try { return (JSON.parse(json) as string[]).join('; '); } catch { return ''; }
}

function serializeObjetivos(json: string): string {
  try { return (JSON.parse(json) as { codigo: string; descricao: string }[]).map(o => o.descricao).join('; '); } catch { return ''; }
}

export function expandAttributesForProduct(db: any, productId: number, opts: ExpansionOptions): void {
  const product = db.selectObjects(
    `SELECT ncm_code FROM project_product WHERE id = ?`, [productId]
  )[0] as { ncm_code: string | null } | undefined;
  if (!product || !product.ncm_code) return;

  db.transaction(() => {
    db.exec({ sql: `DELETE FROM project_attr_row WHERE product_id = ?`, bind: [productId] });

    const modalityPlaceholders = opts.modalidades.map(() => '?').join(',');
    const excludedPlaceholders = opts.excludedAttrs.length ? opts.excludedAttrs.map(() => '?').join(',') : "''";

    const sql = `
      SELECT d.codigo AS attr_code,
             d.nome_apresentacao AS attr_name,
             m.obrigatorio, m.multivalorado,
             d.forma_preenchimento,
             d.dominio_json, d.orgaos_json, d.objetivos_json
      FROM ncm_attr m
      JOIN attribute_def d ON d.codigo = m.attr_code
      WHERE m.ncm_code = ?
        AND m.modalidade IN (${modalityPlaceholders})
        ${opts.mandatoryOnly ? 'AND m.obrigatorio = 1' : ''}
        AND (m.data_fim = '' OR m.data_fim = '9999-12-31' OR m.data_fim >= ?)
        AND (d.data_fim = '' OR d.data_fim = '9999-12-31' OR d.data_fim >= ?)
        ${opts.excludedAttrs.length ? `AND d.codigo NOT IN (${excludedPlaceholders})` : ''}
      ORDER BY m.obrigatorio DESC, d.codigo
    `;

    const params: unknown[] = [product.ncm_code, ...opts.modalidades, opts.today, opts.today, ...opts.excludedAttrs];
    const attrs = db.selectObjects(sql, params) as any[];

    if (attrs.length === 0) {
      db.exec({
        sql: `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
                attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
                attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
              VALUES (?,1,NULL,NULL,'','','','','','','','','empty_ncm')`,
        bind: [productId]
      });
      return;
    }

    const insert = db.prepare(
      `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
         attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
         attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'base')`
    );
    try {
      let counter = 1;
      for (const a of attrs) {
        insert.bind([
          productId, counter++, a.attr_code, a.attr_name,
          a.obrigatorio ? 'Yes' : 'No',
          a.multivalorado ? 'Yes' : 'No',
          a.forma_preenchimento,
          serializeDomain(a.dominio_json),
          serializeOrgaos(a.orgaos_json),
          serializeObjetivos(a.objetivos_json),
          '',  // attr_conditional_on (base rows)
          ''   // attr_value
        ]).stepReset();
      }
    } finally { insert.finalize(); }
  });
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/integration/expansion.test.ts
git add src/lib/core/expansion.ts tests/integration/expansion.test.ts
git commit -m "feat: add attribute expansion with filters and empty-NCM placeholder"
```

---

## Phase 7 — Core logic: conditional second-pass

### Task 21: Conditional expansion

**Files:**
- Create: `src/lib/core/conditionals.ts`
- Create: `tests/integration/conditionals.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/conditionals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { importAttributes } from '../../src/lib/import/attr-orchestrator';
import { expandAttributesForProduct } from '../../src/lib/core/expansion';
import { expandConditionalsForProduct } from '../../src/lib/core/conditionals';

async function seed() {
  const s = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const db = new s.oo1.DB(':memory:', 'ct');
  for (const stmt of DDL) db.exec(stmt);
  const raw = readFileSync('tests/fixtures/attrs-sample.json', 'utf8');
  // Modify sample to have a matching parent condition for ATT_9332 = '999'
  // Sample already has ATT_9332 parent + ATT_9999 child when value = '999'
  await importAttributes(db, zipSync({ 'data.json': strToU8(raw) }), '2026-04-18T00:00:00Z');
  db.exec({
    sql: `INSERT INTO project_product(id, unique_id, short_desc, long_desc, ncm_code, ncm_description)
          VALUES (1, 'P1', 't', 't', '0101.21.00', 'R')`
  });
  expandAttributesForProduct(db, 1, { modalidades: ['Importação'], mandatoryOnly: false, excludedAttrs: [], today: '2026-04-18' });
  return db;
}

describe('expandConditionalsForProduct', () => {
  it('inserts child rows when parent value matches EQ rule', async () => {
    const db = await seed();
    // Set parent ATT_9332 value to '999'
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='999' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    const rows = db.selectObjects(`SELECT attr_code, source, attr_conditional_on FROM project_attr_row WHERE product_id=1 ORDER BY attr_counter`) as any[];
    const child = rows.find(r => r.attr_code === 'ATT_9999');
    expect(child).toBeDefined();
    expect(child.source).toBe('conditional');
    expect(child.attr_conditional_on).toBe('ATT_9332 = 999');
  });

  it('does not insert children when parent value does not match', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='01' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    const codes = (db.selectObjects(`SELECT attr_code FROM project_attr_row WHERE product_id=1`) as any[]).map(r => r.attr_code);
    expect(codes).not.toContain('ATT_9999');
  });

  it('re-runs safely (removes stale conditional rows)', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='999' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    expandConditionalsForProduct(db, 1);
    const cnt = db.selectValue(`SELECT COUNT(*) FROM project_attr_row WHERE product_id=1 AND attr_code='ATT_9999'`);
    expect(cnt).toBe(1);
  });

  it('renumbers attr_counter sequentially', async () => {
    const db = await seed();
    db.exec({ sql: `UPDATE project_attr_row SET attr_value='999' WHERE product_id=1 AND attr_code='ATT_9332'` });
    expandConditionalsForProduct(db, 1);
    const counters = (db.selectObjects(`SELECT attr_counter FROM project_attr_row WHERE product_id=1 ORDER BY attr_counter`) as any[])
      .map(r => r.attr_counter);
    expect(counters).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/core/conditionals.ts`:

```ts
import type { ConditionOperator } from '../types';

function conditionMatches(op: ConditionOperator, triggerValue: string, actualValue: string): boolean {
  if (!actualValue) return op === 'UNKNOWN' ? false : false;
  switch (op) {
    case 'EQ': return actualValue === triggerValue;
    case 'NEQ': return actualValue !== triggerValue;
    case 'IN': return triggerValue.split(',').map(s => s.trim()).includes(actualValue);
    case 'FILLED': return actualValue.trim().length > 0;
    case 'UNKNOWN':
    default:
      return false;
  }
}

function serializeDomain(dominioJson: string): string {
  try {
    const arr = JSON.parse(dominioJson) as { codigo: string; descricao: string }[];
    return arr.map(d => `${d.codigo} - ${d.descricao}`).join('; ');
  } catch { return ''; }
}
function serializeOrgaos(j: string) { try { return (JSON.parse(j) as string[]).join('; '); } catch { return ''; } }
function serializeObjetivos(j: string) { try { return (JSON.parse(j) as {codigo:string;descricao:string}[]).map(o => o.descricao).join('; '); } catch { return ''; } }

export function expandConditionalsForProduct(db: any, productId: number): void {
  db.transaction(() => {
    db.exec({ sql: `DELETE FROM project_attr_row WHERE product_id = ? AND source = 'conditional'`, bind: [productId] });

    const parents = db.selectObjects(
      `SELECT r.id, r.attr_counter, r.attr_code, r.attr_value
       FROM project_attr_row r
       JOIN attribute_def d ON d.codigo = r.attr_code
       WHERE r.product_id = ?
         AND r.source = 'base'
         AND d.atributo_condicionante = 1
         AND COALESCE(r.attr_value,'') <> ''`,
      [productId]
    ) as any[];

    interface NewChild {
      afterCounter: number;
      attr_code: string;
      attr_name: string;
      attr_mandatory: string;
      attr_multivalued: string;
      attr_fill_type: string;
      attr_domain_values: string;
      attr_regulatory_body: string;
      attr_objective: string;
      attr_conditional_on: string;
    }

    const newChildren: NewChild[] = [];
    for (const p of parents) {
      const rules = db.selectObjects(
        `SELECT * FROM conditional WHERE parent_attr_code = ?`,
        [p.attr_code]
      ) as any[];
      for (const r of rules) {
        if (conditionMatches(r.parent_operator, r.parent_value, p.attr_value)) {
          newChildren.push({
            afterCounter: p.attr_counter,
            attr_code: r.child_attr_code,
            attr_name: r.child_nome_apresentacao || r.child_nome,
            attr_mandatory: r.child_obrigatorio ? 'Yes' : 'No',
            attr_multivalued: r.child_multivalorado ? 'Yes' : 'No',
            attr_fill_type: r.child_forma_preenchimento,
            attr_domain_values: serializeDomain(r.child_dominio_json),
            attr_regulatory_body: serializeOrgaos(r.child_orgaos_json),
            attr_objective: serializeObjetivos(r.child_objetivos_json),
            attr_conditional_on: `${r.parent_attr_code} = ${r.parent_value}`
          });
        }
      }
    }

    // Insert all children with a temporary high counter; then renumber everything
    const insert = db.prepare(
      `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
         attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
         attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'conditional')`
    );
    try {
      let tempCounter = 100000;
      for (const c of newChildren) {
        // Insert with a temporary counter that sorts after its parent. We'll re-order after.
        insert.bind([
          productId, c.afterCounter * 1000 + (tempCounter++ - 100000) + 1,
          c.attr_code, c.attr_name,
          c.attr_mandatory, c.attr_multivalued, c.attr_fill_type,
          c.attr_domain_values, c.attr_regulatory_body, c.attr_objective,
          c.attr_conditional_on
        ]).stepReset();
      }
    } finally { insert.finalize(); }

    // Renumber attr_counter sequentially, keeping children immediately after their parent
    // Order by (parent_counter, source='base' first, then original id ascending)
    const ordered = db.selectObjects(
      `SELECT id FROM project_attr_row
       WHERE product_id = ?
       ORDER BY
         CASE WHEN source='conditional' THEN attr_counter/1000 ELSE attr_counter END,
         CASE WHEN source='conditional' THEN 1 ELSE 0 END,
         id`,
      [productId]
    ) as any[];

    const upd = db.prepare(`UPDATE project_attr_row SET attr_counter = ? WHERE id = ?`);
    try {
      let i = 1;
      for (const row of ordered) {
        upd.bind([i++, row.id]).stepReset();
      }
    } finally { upd.finalize(); }
  });
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/integration/conditionals.test.ts
git add src/lib/core/conditionals.ts tests/integration/conditionals.test.ts
git commit -m "feat: add conditional attribute second-pass expansion"
```

---

## Phase 8 — Export

### Task 22: CSV export

**Files:**
- Create: `src/lib/export/csv.ts`
- Create: `tests/unit/csv.test.ts`

- [ ] **Step 1: Failing test**

`tests/unit/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCsv } from '../../src/lib/export/csv';

describe('toCsv', () => {
  it('generates headers and rows', () => {
    const out = toCsv(
      ['id', 'name'],
      [[1, 'Alice'], [2, 'Bob']]
    );
    expect(out).toBe('id,name\r\n1,Alice\r\n2,Bob');
  });

  it('quotes values containing commas', () => {
    const out = toCsv(['a'], [['x,y']]);
    expect(out).toBe('a\r\n"x,y"');
  });

  it('escapes embedded quotes', () => {
    const out = toCsv(['a'], [['say "hi"']]);
    expect(out).toBe('a\r\n"say ""hi"""');
  });

  it('quotes values containing newlines', () => {
    const out = toCsv(['a'], [['line1\nline2']]);
    expect(out).toContain('"line1\nline2"');
  });

  it('handles null and undefined as empty strings', () => {
    const out = toCsv(['a', 'b'], [[null, undefined]]);
    expect(out).toBe('a,b\r\n,');
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/export/csv.ts`:

```ts
function cell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(',')];
  for (const r of rows) lines.push(r.map(cell).join(','));
  return lines.join('\r\n');
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/unit/csv.test.ts
git add src/lib/export/csv.ts tests/unit/csv.test.ts
git commit -m "feat: add CSV serializer"
```

### Task 23: XLSX export with dropdown validation

**Files:**
- Create: `src/lib/export/xlsx.ts`
- Create: `tests/unit/xlsx.test.ts`

- [ ] **Step 1: Failing test**

`tests/unit/xlsx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook } from '../../src/lib/export/xlsx';

describe('buildWorkbook', () => {
  it('creates a workbook with the Classificacao sheet and correct headers', async () => {
    const buf = await buildWorkbook([
      {
        unique_id: 'P1', short_desc: 's', long_desc: 'l',
        extra_1: null, extra_2: null, extra_3: null, extra_4: null, extra_5: null,
        ncm_code: '0101.21.00', ncm_description: 'R',
        attr_counter: 1, attr_code: 'ATT_1', attr_name: 'Material',
        attr_mandatory: 'Yes', attr_multivalued: 'No',
        attr_fill_type: 'LISTA_ESTATICA',
        attr_domain_values: '01 - A; 02 - B',
        attr_regulatory_body: 'INMETRO', attr_objective: 'Produto',
        attr_conditional_on: '', attr_value: ''
      }
    ], { extraLabels: ['', '', '', '', ''], withDropdowns: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.getWorksheet('Classificacao')!;
    expect(sheet.getCell('A1').value).toBe('unique_id');
    expect(sheet.rowCount).toBe(2); // header + 1 data row
  });

  it('uses extra labels as headers when provided', async () => {
    const buf = await buildWorkbook([], { extraLabels: ['SKU', '', '', '', ''], withDropdowns: false });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.getWorksheet('Classificacao')!;
    const headers = (sheet.getRow(1).values as any[]).slice(1); // 1-indexed
    expect(headers).toContain('SKU');
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/export/xlsx.ts`:

```ts
import ExcelJS from 'exceljs';

export interface OutputRow {
  unique_id: string;
  short_desc: string | null;
  long_desc: string | null;
  extra_1: string | null; extra_2: string | null; extra_3: string | null;
  extra_4: string | null; extra_5: string | null;
  ncm_code: string | null;
  ncm_description: string | null;
  attr_counter: number | null;
  attr_code: string | null;
  attr_name: string | null;
  attr_mandatory: string | null;
  attr_multivalued: string | null;
  attr_fill_type: string | null;
  attr_domain_values: string | null;
  attr_regulatory_body: string | null;
  attr_objective: string | null;
  attr_conditional_on: string | null;
  attr_value: string | null;
}

export interface WorkbookOptions {
  extraLabels: [string, string, string, string, string];
  withDropdowns: boolean;
}

function baseHeaders(labels: string[]) {
  const extraCols = labels.map((l, i) => l || `extra_${i + 1}`);
  return [
    'unique_id', 'short_desc', 'long_desc',
    ...extraCols,
    'NCM_code', 'NCM_description',
    'attr_counter', 'attr_code', 'attr_name',
    'attr_mandatory', 'attr_multivalued',
    'attr_fill_type', 'attr_domain_values',
    'attr_regulatory_body', 'attr_objective',
    'attr_conditional_on', 'attr_value'
  ];
}

export async function buildWorkbook(rows: OutputRow[], opts: WorkbookOptions): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Classificacao');
  const headers = baseHeaders(opts.extraLabels);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    sheet.addRow([
      r.unique_id, r.short_desc, r.long_desc,
      r.extra_1, r.extra_2, r.extra_3, r.extra_4, r.extra_5,
      r.ncm_code, r.ncm_description,
      r.attr_counter, r.attr_code, r.attr_name,
      r.attr_mandatory, r.attr_multivalued,
      r.attr_fill_type, r.attr_domain_values,
      r.attr_regulatory_body, r.attr_objective,
      r.attr_conditional_on, r.attr_value
    ]);

    if (opts.withDropdowns && r.attr_fill_type === 'LISTA_ESTATICA' && r.attr_domain_values) {
      const codes = r.attr_domain_values.split(';').map(s => s.trim().split(' - ')[0]).filter(Boolean);
      if (codes.length && codes.length <= 200) {
        const col = headers.indexOf('attr_value') + 1;
        const cell = sheet.getRow(i + 2).getCell(col);
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${codes.join(',')}"`]
        };
      }
    }
  }

  sheet.columns.forEach((c) => { c.width = 18; });

  const ab = await wb.xlsx.writeBuffer();
  return new Uint8Array(ab as ArrayBuffer);
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/unit/xlsx.test.ts
git add src/lib/export/xlsx.ts tests/unit/xlsx.test.ts
git commit -m "feat: add XLSX workbook builder with dropdown validation"
```

### Task 24: Export query + file-download helper

**Files:**
- Create: `src/lib/export/exporter.ts`
- Create: `tests/integration/exporter.test.ts`

- [ ] **Step 1: Failing test**

`tests/integration/exporter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/lib/db/schema';
import { collectOutputRows } from '../../src/lib/export/exporter';

describe('collectOutputRows', () => {
  it('joins product + attr rows in stacked format', async () => {
    const s = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new s.oo1.DB(':memory:', 'ct');
    for (const stmt of DDL) db.exec(stmt);
    db.exec({
      sql: `INSERT INTO project_product(id, unique_id, short_desc, long_desc, ncm_code, ncm_description)
            VALUES (1, 'P1', 's', 'l', '0101.21.00', 'R')`
    });
    db.exec({
      sql: `INSERT INTO project_attr_row(product_id, attr_counter, attr_code, attr_name,
              attr_mandatory, attr_multivalued, attr_fill_type, attr_domain_values,
              attr_regulatory_body, attr_objective, attr_conditional_on, attr_value, source)
            VALUES (1, 1, 'ATT_1', 'Material', 'Yes', 'No', 'LISTA_ESTATICA', '01 - A', 'INMETRO', 'Produto', '', '', 'base')`
    });
    const rows = collectOutputRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].unique_id).toBe('P1');
    expect(rows[0].attr_code).toBe('ATT_1');
    expect(rows[0].ncm_code).toBe('0101.21.00');
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/export/exporter.ts`:

```ts
import type { OutputRow } from './xlsx';

export function collectOutputRows(db: any): OutputRow[] {
  const rows = db.selectObjects(`
    SELECT p.unique_id, p.short_desc, p.long_desc,
           p.extra_1, p.extra_2, p.extra_3, p.extra_4, p.extra_5,
           p.ncm_code, p.ncm_description,
           r.attr_counter, r.attr_code, r.attr_name,
           r.attr_mandatory, r.attr_multivalued,
           r.attr_fill_type, r.attr_domain_values,
           r.attr_regulatory_body, r.attr_objective,
           r.attr_conditional_on, r.attr_value
    FROM project_product p
    LEFT JOIN project_attr_row r ON r.product_id = p.id
    ORDER BY p.id, r.attr_counter
  `) as any[];
  return rows as OutputRow[];
}

export function triggerDownload(data: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
```

- [ ] **Step 3: Tests pass; commit**

```bash
npm run test -- --run tests/integration/exporter.test.ts
git add src/lib/export/exporter.ts tests/integration/exporter.test.ts
git commit -m "feat: add output row collector and file download helper"
```

---

## Phase 9 — UI foundation

### Task 25: Extend DB client with high-level API

**Files:**
- Modify: `src/lib/db/client.ts`
- Modify: `src/lib/db/worker.ts`

- [ ] **Step 1: Extend RPC protocol with operation-specific messages**

Edit `src/lib/db/rpc.ts` — append:

```ts
export type OpRequest =
  | { kind: 'importNcm'; rawJson: string }
  | { kind: 'importAttrs'; zipData: Uint8Array }
  | { kind: 'search'; query: string; classifiableOnly: boolean }
  | { kind: 'expand'; productId: number; modalidades: ('Importação'|'Exportação')[]; mandatoryOnly: boolean; excludedAttrs: string[] }
  | { kind: 'expandConditionals'; productId: number };
```

- [ ] **Step 2: Handle them in the worker**

Modify `src/lib/db/worker.ts` to import the orchestrators and handle these message kinds. Append to the existing `self.onmessage` handler a new branch:

```ts
// In worker.ts, inside onmessage switch — add cases:
if (req.kind === 'importNcm') {
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
```

- [ ] **Step 3: Add matching methods on `DbClient` in `client.ts`**

```ts
  importNcm(rawJson: string) { return this.call<number>({ kind: 'importNcm', rawJson }); }
  importAttrs(zipData: Uint8Array) { return this.call<number>({ kind: 'importAttrs', zipData }); }
  search(query: string, classifiableOnly = true) { return this.call<any[]>({ kind: 'search', query, classifiableOnly }); }
  expand(productId: number, modalidades: string[], mandatoryOnly: boolean, excludedAttrs: string[]) {
    return this.call<null>({ kind: 'expand', productId, modalidades, mandatoryOnly, excludedAttrs } as any);
  }
  expandConditionals(productId: number) { return this.call<null>({ kind: 'expandConditionals', productId }); }
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/
git commit -m "feat: extend DbClient with high-level ops (import/search/expand)"
```

### Task 26: Svelte stores for global state

**Files:**
- Create: `src/lib/stores/db-status.svelte.ts`
- Create: `src/lib/stores/project.svelte.ts`
- Create: `src/lib/stores/settings.svelte.ts`

- [ ] **Step 1: db-status store**

`src/lib/stores/db-status.svelte.ts`:

```ts
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
```

- [ ] **Step 2: settings store**

`src/lib/stores/settings.svelte.ts`:

```ts
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
```

- [ ] **Step 3: project store**

`src/lib/stores/project.svelte.ts`:

```ts
import { db } from '$lib/db/client';

export interface ProductRow {
  id: number; unique_id: string; short_desc: string | null; long_desc: string | null;
  extra_1: string | null; extra_2: string | null; extra_3: string | null; extra_4: string | null; extra_5: string | null;
  ncm_code: string | null; ncm_description: string | null;
  attrRowCount?: number;
}

class ProjectStore {
  products = $state<ProductRow[]>([]);
  selectedId = $state<number | null>(null);

  async load() {
    await db.init();
    this.products = await db.select<ProductRow>(`
      SELECT p.*, (SELECT COUNT(*) FROM project_attr_row r WHERE r.product_id = p.id) as attrRowCount
      FROM project_product p ORDER BY p.id
    `);
  }

  async addMany(rows: Omit<ProductRow, 'id'>[]) {
    await db.init();
    for (const r of rows) {
      await db.exec(
        `INSERT INTO project_product(unique_id, short_desc, long_desc, extra_1, extra_2, extra_3, extra_4, extra_5)
         VALUES (?,?,?,?,?,?,?,?)`,
        [r.unique_id, r.short_desc, r.long_desc, r.extra_1, r.extra_2, r.extra_3, r.extra_4, r.extra_5]
      );
    }
    await this.load();
  }

  async clear() {
    await db.init();
    await db.exec(`DELETE FROM project_attr_row`);
    await db.exec(`DELETE FROM project_product`);
    this.products = [];
    this.selectedId = null;
  }

  async assignNcm(productId: number, ncm_code: string, ncm_description: string) {
    await db.exec(`UPDATE project_product SET ncm_code=?, ncm_description=? WHERE id=?`,
      [ncm_code, ncm_description, productId]);
    await this.load();
  }

  async attrRowsFor(productId: number) {
    return db.select<any>(`SELECT * FROM project_attr_row WHERE product_id=? ORDER BY attr_counter`, [productId]);
  }

  async setAttrValue(rowId: number, value: string) {
    await db.exec(`UPDATE project_attr_row SET attr_value=? WHERE id=?`, [value, rowId]);
  }
}

export const project = new ProjectStore();
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/
git commit -m "feat: add Svelte stores for db status, settings, and project"
```

### Task 27: Layout + navigation

**Files:**
- Create: `src/routes/+layout.svelte`
- Create: `src/routes/+page.svelte`
- Modify: `src/app.css`

- [ ] **Step 1: Layout with nav**

`src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { dbStatus } from '$lib/stores/db-status.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  const tabs = [
    { href: '/database', label: 'Banco de Dados' },
    { href: '/import', label: 'Importar' },
    { href: '/mapping', label: 'Mapear Colunas' },
    { href: '/classify', label: 'Classificar' },
    { href: '/export', label: 'Exportar' },
    { href: '/settings', label: 'Configurações' },
    { href: '/changelog', label: 'Histórico' }
  ];

  onMount(async () => {
    await dbStatus.refresh();
    await settings.load();
  });
</script>

<nav>
  {#each tabs as t}
    <a href={t.href} class:active={$page.url.pathname === t.href}>{t.label}</a>
  {/each}
  <span class="spacer"></span>
  <span class="status">
    {#if dbStatus.hasData}
      {dbStatus.ncmCount} NCMs · v{dbStatus.lastVersao}
    {:else}
      Sem dados. Vá em "Banco de Dados".
    {/if}
  </span>
</nav>

<main>
  <slot />
</main>

<style>
  nav { display: flex; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid #ddd; align-items: center; }
  nav a { padding: 0.5rem 0.75rem; border-radius: 4px; color: inherit; text-decoration: none; }
  nav a.active { background: #1a1a1a; color: white; }
  .spacer { flex: 1; }
  .status { font-size: 0.85rem; color: #666; }
  main { padding: 1rem; }
</style>
```

- [ ] **Step 2: Root page redirects**

`src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  onMount(() => goto('/database'));
</script>
```

- [ ] **Step 3: Run dev server, verify nav shows**

```bash
npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte src/routes/+page.svelte
git commit -m "feat: add app layout with Portuguese nav tabs"
```

---

## Phase 10 — UI screens

### Task 28: Database screen (update NCM / attributes)

**Files:**
- Create: `src/routes/database/+page.svelte`

- [ ] **Step 1: Implement**

`src/routes/database/+page.svelte`:

```svelte
<script lang="ts">
  import { db } from '$lib/db/client';
  import { dbStatus } from '$lib/stores/db-status.svelte';

  const NCM_URL = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';
  const ATTR_URL = 'https://portalunico.siscomex.gov.br/cadatributos/api/atributo-ncm/download/json';

  let ncmStatus = $state<string>('');
  let attrStatus = $state<string>('');
  let busy = $state(false);

  async function handleNcmDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0]; if (!f) return;
    await importNcm(f);
  }
  async function handleNcmPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    await importNcm(f);
  }
  async function importNcm(file: File) {
    busy = true; ncmStatus = 'Lendo arquivo...';
    try {
      const text = await file.text();
      ncmStatus = 'Processando NCM...';
      await db.importNcm(text);
      await dbStatus.refresh();
      ncmStatus = `Importado: ${dbStatus.ncmCount} códigos`;
    } catch (e: any) { ncmStatus = 'Erro: ' + e.message; }
    finally { busy = false; }
  }

  async function handleAttrDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0]; if (!f) return;
    await importAttrs(f);
  }
  async function handleAttrPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    await importAttrs(f);
  }
  async function importAttrs(file: File) {
    busy = true; attrStatus = 'Lendo ZIP...';
    try {
      const ab = await file.arrayBuffer();
      attrStatus = 'Descompactando e processando...';
      await db.importAttrs(new Uint8Array(ab));
      await dbStatus.refresh();
      attrStatus = `Importado: ${dbStatus.attrCount} atributos, ${dbStatus.mappingCount} mapeamentos`;
    } catch (e: any) { attrStatus = 'Erro: ' + e.message; }
    finally { busy = false; }
  }
</script>

<h1>Banco de Dados</h1>
<p>
  <strong>Status:</strong>
  {#if dbStatus.hasData}
    {dbStatus.ncmCount} NCMs, {dbStatus.attrCount} atributos, versão {dbStatus.lastVersao} (atualizado: {dbStatus.lastDataAtualizacao})
  {:else}
    Ainda não há dados. Baixe os dois arquivos abaixo.
  {/if}
</p>

<div class="grid">
  <section ondragover={(e) => e.preventDefault()} ondrop={handleNcmDrop}>
    <h2>Nomenclatura NCM</h2>
    <a href={NCM_URL} target="_blank" rel="noopener">Baixar do Siscomex ↗</a>
    <p>Arraste o arquivo JSON aqui, ou:</p>
    <input type="file" accept=".json" onchange={handleNcmPick} disabled={busy} />
    {#if ncmStatus}<p class="status">{ncmStatus}</p>{/if}
  </section>

  <section ondragover={(e) => e.preventDefault()} ondrop={handleAttrDrop}>
    <h2>Atributos NCM (ZIP)</h2>
    <a href={ATTR_URL} target="_blank" rel="noopener">Baixar do Siscomex ↗</a>
    <p>Arraste o arquivo ZIP aqui, ou:</p>
    <input type="file" accept=".zip" onchange={handleAttrPick} disabled={busy} />
    {#if attrStatus}<p class="status">{attrStatus}</p>{/if}
  </section>
</div>

{#if busy}<p class="busy">Processando… pode levar até 30 segundos.</p>{/if}

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
  section { border: 2px dashed #ccc; padding: 1rem; border-radius: 8px; }
  .status { color: #090; }
  .busy { color: #c60; }
</style>
```

- [ ] **Step 2: Manual test** — run `npm run dev`, navigate to `/database`, download a small fixture or paste a manual JSON and verify it imports.

- [ ] **Step 3: Commit**

```bash
git add src/routes/database/
git commit -m "feat: add Database screen with drag-drop + manual download links"
```

### Task 29: Product import screen (CSV/XLSX)

**Files:**
- Create: `src/routes/import/+page.svelte`

- [ ] **Step 1: Install xlsx reader (reuse ExcelJS)** — already installed.

- [ ] **Step 2: Implement**

`src/routes/import/+page.svelte`:

```svelte
<script lang="ts">
  import ExcelJS from 'exceljs';
  import { goto } from '$app/navigation';

  let headers = $state<string[]>([]);
  let preview = $state<string[][]>([]);
  let allRows = $state<string[][]>([]);
  let fileName = $state<string>('');
  let error = $state<string>('');

  function parseCsv(text: string): string[][] {
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.map(l => {
      const out: string[] = []; let cur = ''; let inQ = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') {
          if (inQ && l[i+1] === '"') { cur += '"'; i++; } else { inQ = !inQ; }
        } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur); return out;
    });
  }

  async function handleFile(file: File) {
    fileName = file.name; error = '';
    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const rows = parseCsv(await file.text());
        headers = rows[0] ?? []; allRows = rows.slice(1);
      } else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const sheet = wb.worksheets[0];
        const rows: string[][] = [];
        sheet.eachRow((row) => {
          rows.push((row.values as any[]).slice(1).map((v: any) => v == null ? '' : String(v)));
        });
        headers = rows[0] ?? []; allRows = rows.slice(1);
      }
      preview = allRows.slice(0, 20);
      sessionStorage.setItem('import:headers', JSON.stringify(headers));
      sessionStorage.setItem('import:rows', JSON.stringify(allRows));
    } catch (e: any) { error = 'Erro ao ler arquivo: ' + e.message; }
  }

  function handleDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0]; if (f) handleFile(f);
  }
  function handlePick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (f) handleFile(f);
  }
</script>

<h1>Importar Produtos</h1>

<div class="drop" ondragover={(e) => e.preventDefault()} ondrop={handleDrop}>
  <p>Arraste um arquivo CSV ou XLSX aqui, ou:</p>
  <input type="file" accept=".csv,.xlsx" onchange={handlePick} />
</div>

{#if error}<p class="error">{error}</p>{/if}

{#if headers.length > 0}
  <p><strong>Arquivo:</strong> {fileName} — {allRows.length} linhas</p>
  <h2>Prévia (primeiras 20)</h2>
  <div class="preview">
    <table>
      <thead><tr>{#each headers as h}<th>{h}</th>{/each}</tr></thead>
      <tbody>
        {#each preview as row}
          <tr>{#each row as cell}<td>{cell}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  </div>
  <button onclick={() => goto('/mapping')}>Continuar → Mapear Colunas</button>
{/if}

<style>
  .drop { border: 2px dashed #ccc; padding: 2rem; border-radius: 8px; text-align: center; }
  .preview { max-height: 400px; overflow: auto; border: 1px solid #eee; }
  table { border-collapse: collapse; font-size: 0.85rem; }
  th, td { border: 1px solid #eee; padding: 0.25rem 0.5rem; white-space: nowrap; }
  .error { color: #c00; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/import/
git commit -m "feat: add product CSV/XLSX import screen with preview"
```

### Task 30: Column mapping screen

**Files:**
- Create: `src/routes/mapping/+page.svelte`

- [ ] **Step 1: Implement**

`src/routes/mapping/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { project } from '$lib/stores/project.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  let headers = $state<string[]>([]);
  let rows = $state<string[][]>([]);

  let uniqueIdCol = $state('');
  let shortDescCol = $state('');
  let longDescCol = $state('');
  let extraCols = $state<[string, string, string, string, string]>(['', '', '', '', '']);
  let extraLabels = $state<[string, string, string, string, string]>(['', '', '', '', '']);
  let error = $state<string>('');

  $effect(() => {
    const h = sessionStorage.getItem('import:headers');
    const r = sessionStorage.getItem('import:rows');
    if (h) headers = JSON.parse(h);
    if (r) rows = JSON.parse(r);
  });

  function indexOf(col: string) { return col ? headers.indexOf(col) : -1; }

  async function commit() {
    error = '';
    if (!uniqueIdCol || !shortDescCol || !longDescCol) {
      error = 'Os 3 campos obrigatórios devem ser mapeados'; return;
    }
    const u = indexOf(uniqueIdCol), s = indexOf(shortDescCol), l = indexOf(longDescCol);
    const e = extraCols.map(indexOf);
    const productRows = rows.map(r => ({
      unique_id: r[u] ?? '',
      short_desc: r[s] ?? '',
      long_desc: r[l] ?? '',
      extra_1: e[0] >= 0 ? r[e[0]] ?? '' : null,
      extra_2: e[1] >= 0 ? r[e[1]] ?? '' : null,
      extra_3: e[2] >= 0 ? r[e[2]] ?? '' : null,
      extra_4: e[3] >= 0 ? r[e[3]] ?? '' : null,
      extra_5: e[4] >= 0 ? r[e[4]] ?? '' : null,
      ncm_code: null, ncm_description: null
    }));

    await project.clear();
    await project.addMany(productRows);
    settings.current.extraLabels = extraLabels;
    await settings.save();
    goto('/classify');
  }
</script>

<h1>Mapear Colunas</h1>

{#if headers.length === 0}
  <p>Nenhum arquivo importado. <a href="/import">Voltar</a>.</p>
{:else}
  <fieldset>
    <legend>Obrigatórios</legend>
    <label>ID único
      <select bind:value={uniqueIdCol}>
        <option value="">— escolher —</option>
        {#each headers as h}<option>{h}</option>{/each}
      </select>
    </label>
    <label>Descrição curta
      <select bind:value={shortDescCol}>
        <option value="">— escolher —</option>
        {#each headers as h}<option>{h}</option>{/each}
      </select>
    </label>
    <label>Descrição longa
      <select bind:value={longDescCol}>
        <option value="">— escolher —</option>
        {#each headers as h}<option>{h}</option>{/each}
      </select>
    </label>
  </fieldset>

  <fieldset>
    <legend>Colunas extras (opcionais)</legend>
    {#each [0,1,2,3,4] as i}
      <div class="extra">
        <input placeholder="Rótulo exibido" bind:value={extraLabels[i]} />
        <select bind:value={extraCols[i]}>
          <option value="">— não usar —</option>
          {#each headers as h}<option>{h}</option>{/each}
        </select>
      </div>
    {/each}
  </fieldset>

  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={commit}>Importar {rows.length} produtos</button>
{/if}

<style>
  fieldset { margin: 1rem 0; padding: 1rem; }
  label { display: block; margin: 0.5rem 0; }
  .extra { display: flex; gap: 0.5rem; margin: 0.25rem 0; }
  .error { color: #c00; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/mapping/
git commit -m "feat: add column mapping screen with required + optional fields"
```

### Task 31: Classify screen (main UI)

**Files:**
- Create: `src/routes/classify/+page.svelte`

- [ ] **Step 1: Implement**

`src/routes/classify/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db/client';
  import { project } from '$lib/stores/project.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let attrRows = $state<any[]>([]);
  let searchTimer: any = null;

  onMount(async () => {
    await project.load();
    await settings.load();
  });

  async function runSearch() {
    if (!searchQuery.trim()) { searchResults = []; return; }
    searchResults = await db.search(searchQuery, true);
  }
  function onQueryInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 200);
  }

  async function pick(id: number) {
    project.selectedId = id;
    searchResults = []; searchQuery = '';
    attrRows = await project.attrRowsFor(id);
  }

  async function assign(code: string, description: string) {
    if (!project.selectedId) return;
    await project.assignNcm(project.selectedId, code, description);
    attrRows = await project.attrRowsFor(project.selectedId);
  }

  async function expand() {
    if (!project.selectedId) return;
    await db.expand(project.selectedId, settings.current.modalidades, settings.current.mandatoryOnly, settings.current.excludedAttrs);
    attrRows = await project.attrRowsFor(project.selectedId);
  }

  async function expandConditionals() {
    if (!project.selectedId) return;
    await db.expandConditionals(project.selectedId);
    attrRows = await project.attrRowsFor(project.selectedId);
  }

  async function onValueChange(rowId: number, value: string) {
    await project.setAttrValue(rowId, value);
  }

  const currentProduct = $derived(project.products.find(p => p.id === project.selectedId));
</script>

<div class="layout">
  <aside>
    <h2>Produtos ({project.products.length})</h2>
    <ul>
      {#each project.products as p}
        <li class:active={p.id === project.selectedId}>
          <button onclick={() => pick(p.id)}>
            <div>{p.unique_id}</div>
            <small>{p.short_desc}</small>
            <small class="ncm">{p.ncm_code ?? 'sem NCM'}</small>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <section>
    {#if currentProduct}
      <h2>{currentProduct.unique_id}</h2>
      <p><strong>Descrição:</strong> {currentProduct.long_desc}</p>
      <p><strong>NCM:</strong> {currentProduct.ncm_code ?? '—'} {currentProduct.ncm_description ?? ''}</p>

      <div class="search">
        <input placeholder="Buscar NCM (ex: tubo aço sem costura)" bind:value={searchQuery} oninput={onQueryInput} />
        {#if searchResults.length}
          <ul class="results">
            {#each searchResults as r}
              <li><button onclick={() => assign(r.codigo, r.descricao)}>{r.codigo} — {r.descricao}</button></li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="actions">
        <button onclick={expand} disabled={!currentProduct.ncm_code}>Expandir Atributos</button>
        <button onclick={expandConditionals} disabled={attrRows.length === 0}>Expandir Condicionais</button>
      </div>

      {#if attrRows.length}
        <table class="attrs">
          <thead>
            <tr><th>#</th><th>Atributo</th><th>Obrig.</th><th>Tipo</th><th>Domínio</th><th>Órgão</th><th>Condicional</th><th>Valor</th></tr>
          </thead>
          <tbody>
            {#each attrRows as r}
              <tr class:conditional={r.source === 'conditional'} class:empty={r.source === 'empty_ncm'}>
                <td>{r.attr_counter}</td>
                <td>{r.attr_name ?? '—'}</td>
                <td>{r.attr_mandatory}</td>
                <td>{r.attr_fill_type}</td>
                <td class="dom">{r.attr_domain_values ?? ''}</td>
                <td>{r.attr_regulatory_body ?? ''}</td>
                <td>{r.attr_conditional_on ?? ''}</td>
                <td>
                  {#if r.attr_fill_type === 'LISTA_ESTATICA' && r.attr_domain_values}
                    <select value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLSelectElement).value)}>
                      <option value="">—</option>
                      {#each r.attr_domain_values.split(';').map((s: string) => s.trim()) as opt}
                        {@const code = opt.split(' - ')[0]}
                        <option value={code}>{opt}</option>
                      {/each}
                    </select>
                  {:else if r.attr_fill_type === 'BOOLEANO'}
                    <select value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLSelectElement).value)}>
                      <option value="">—</option><option value="true">Sim</option><option value="false">Não</option>
                    </select>
                  {:else if r.attr_fill_type === 'DATA'}
                    <input type="date" value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLInputElement).value)} />
                  {:else}
                    <input value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLInputElement).value)} />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else}
      <p>Selecione um produto à esquerda.</p>
    {/if}
  </section>
</div>

<style>
  .layout { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; }
  aside { border-right: 1px solid #ddd; padding-right: 0.5rem; max-height: 80vh; overflow: auto; }
  aside ul { list-style: none; padding: 0; margin: 0; }
  aside li button { width: 100%; text-align: left; padding: 0.5rem; border: 0; background: transparent; cursor: pointer; }
  aside li.active button { background: #eef; }
  aside small { display: block; color: #666; font-size: 0.75rem; }
  aside small.ncm { color: #06a; }
  .search input { width: 100%; padding: 0.5rem; }
  .results { list-style: none; padding: 0; max-height: 200px; overflow: auto; border: 1px solid #eee; }
  .results button { width: 100%; text-align: left; padding: 0.25rem; border: 0; background: transparent; cursor: pointer; }
  .actions { margin: 1rem 0; display: flex; gap: 0.5rem; }
  .attrs { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .attrs th, .attrs td { border: 1px solid #eee; padding: 0.25rem; }
  .conditional { background: #fffae0; }
  .empty { color: #999; }
  .dom { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/classify/
git commit -m "feat: add classify screen with search, expansion, and inline attr editing"
```

### Task 32: Export screen

**Files:**
- Create: `src/routes/export/+page.svelte`

- [ ] **Step 1: Implement**

`src/routes/export/+page.svelte`:

```svelte
<script lang="ts">
  import { db } from '$lib/db/client';
  import { settings } from '$lib/stores/settings.svelte';
  import { project } from '$lib/stores/project.svelte';
  import { toCsv } from '$lib/export/csv';
  import { buildWorkbook, type OutputRow } from '$lib/export/xlsx';
  import { collectOutputRows, triggerDownload } from '$lib/export/exporter';
  import { onMount } from 'svelte';

  let format = $state<'csv' | 'xlsx'>('xlsx');
  let withDropdowns = $state(true);
  let totalRows = $state(0);
  let unfilledMandatory = $state(0);
  let busy = $state(false);

  onMount(async () => {
    await project.load();
    await refreshStats();
  });

  async function refreshStats() {
    const r = await db.select<{c:number}>(`SELECT COUNT(*) as c FROM project_attr_row`);
    totalRows = r[0].c;
    const u = await db.select<{c:number}>(`SELECT COUNT(*) as c FROM project_attr_row WHERE attr_mandatory='Yes' AND (attr_value='' OR attr_value IS NULL)`);
    unfilledMandatory = u[0].c;
  }

  function headers(): string[] {
    const labels = settings.current.extraLabels.map((l, i) => l || `extra_${i+1}`);
    return ['unique_id','short_desc','long_desc', ...labels,
            'NCM_code','NCM_description','attr_counter','attr_code','attr_name',
            'attr_mandatory','attr_multivalued','attr_fill_type','attr_domain_values',
            'attr_regulatory_body','attr_objective','attr_conditional_on','attr_value'];
  }

  async function doExport() {
    busy = true;
    try {
      const rows: OutputRow[] = await db.select<OutputRow>(`
        SELECT p.unique_id, p.short_desc, p.long_desc,
               p.extra_1, p.extra_2, p.extra_3, p.extra_4, p.extra_5,
               p.ncm_code, p.ncm_description,
               r.attr_counter, r.attr_code, r.attr_name,
               r.attr_mandatory, r.attr_multivalued,
               r.attr_fill_type, r.attr_domain_values,
               r.attr_regulatory_body, r.attr_objective,
               r.attr_conditional_on, r.attr_value
        FROM project_product p LEFT JOIN project_attr_row r ON r.product_id = p.id
        ORDER BY p.id, r.attr_counter
      `);
      const date = new Date().toISOString().slice(0, 10);
      const name = settings.current.projectName || 'projeto';
      if (format === 'csv') {
        const arr = rows.map(r => headers().map(h => (r as any)[h.toLowerCase()] ?? (r as any)[h] ?? ''));
        triggerDownload(toCsv(headers(), arr), `ncm_${name}_${date}.csv`, 'text/csv;charset=utf-8');
      } else {
        const buf = await buildWorkbook(rows, {
          extraLabels: settings.current.extraLabels,
          withDropdowns
        });
        triggerDownload(buf, `ncm_${name}_${date}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } finally { busy = false; }
  }
</script>

<h1>Exportar</h1>
<p>{project.products.length} produtos · {totalRows} linhas de atributos</p>
{#if unfilledMandatory > 0}<p class="warn">⚠ {unfilledMandatory} campos obrigatórios sem preenchimento</p>{/if}

<fieldset>
  <legend>Formato</legend>
  <label><input type="radio" bind:group={format} value="xlsx" /> XLSX</label>
  <label><input type="radio" bind:group={format} value="csv" /> CSV</label>
  {#if format === 'xlsx'}
    <label><input type="checkbox" bind:checked={withDropdowns} /> Incluir dropdowns para LISTA_ESTATICA</label>
  {/if}
</fieldset>

<button onclick={doExport} disabled={busy || totalRows === 0}>{busy ? 'Gerando…' : 'Exportar'}</button>

<style>
  .warn { color: #c60; }
  fieldset { margin: 1rem 0; padding: 1rem; }
  label { display: block; margin: 0.25rem 0; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/export/
git commit -m "feat: add export screen with CSV/XLSX and dropdown toggle"
```

### Task 33: Settings screen

**Files:**
- Create: `src/routes/settings/+page.svelte`

- [ ] **Step 1: Implement**

`src/routes/settings/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db/client';
  import { settings } from '$lib/stores/settings.svelte';
  import { project } from '$lib/stores/project.svelte';
  import { dbStatus } from '$lib/stores/db-status.svelte';

  let allAttrs = $state<{codigo: string; nome_apresentacao: string; orgaos_json: string}[]>([]);
  let filterText = $state('');
  let bodyFilter = $state('');

  onMount(async () => {
    await settings.load();
    allAttrs = await db.select(`SELECT codigo, nome_apresentacao, orgaos_json FROM attribute_def ORDER BY nome_apresentacao`);
  });

  const filtered = $derived(allAttrs.filter(a => {
    if (filterText && !a.nome_apresentacao.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (bodyFilter) {
      try {
        const orgs = JSON.parse(a.orgaos_json || '[]') as string[];
        if (!orgs.includes(bodyFilter)) return false;
      } catch {}
    }
    return true;
  }));

  function isExcluded(code: string) { return settings.current.excludedAttrs.includes(code); }
  function toggle(code: string) {
    const ex = settings.current.excludedAttrs;
    settings.current.excludedAttrs = isExcluded(code) ? ex.filter(c => c !== code) : [...ex, code];
  }
  function selectAll() { settings.current.excludedAttrs = []; }
  function deselectAll() { settings.current.excludedAttrs = allAttrs.map(a => a.codigo); }

  async function save() { await settings.save(); alert('Salvo'); }

  async function clearProject() {
    if (confirm('Apagar todos os produtos e classificações? (O banco NCM permanece.)')) {
      await project.clear(); alert('Projeto apagado');
    }
  }
  async function clearDb() {
    if (confirm('Apagar TODO o banco NCM/atributos? Você precisará reimportar.')) {
      await db.exec('DELETE FROM ncm');
      await db.exec('DELETE FROM attribute_def');
      await db.exec('DELETE FROM ncm_attr');
      await db.exec('DELETE FROM conditional');
      await db.exec('DELETE FROM changelog');
      await db.exec('DELETE FROM update_run');
      await dbStatus.refresh();
      alert('Banco apagado');
    }
  }
</script>

<h1>Configurações</h1>

<fieldset>
  <legend>Nome do projeto</legend>
  <input bind:value={settings.current.projectName} />
</fieldset>

<fieldset>
  <legend>Modalidade</legend>
  <label><input type="checkbox" checked={settings.current.modalidades.includes('Importação')}
    onchange={(e) => {
      const on = (e.target as HTMLInputElement).checked;
      settings.current.modalidades = on
        ? [...settings.current.modalidades, 'Importação' as const]
        : settings.current.modalidades.filter(m => m !== 'Importação');
    }} /> Importação</label>
  <label><input type="checkbox" checked={settings.current.modalidades.includes('Exportação')}
    onchange={(e) => {
      const on = (e.target as HTMLInputElement).checked;
      settings.current.modalidades = on
        ? [...settings.current.modalidades, 'Exportação' as const]
        : settings.current.modalidades.filter(m => m !== 'Exportação');
    }} /> Exportação</label>
</fieldset>

<fieldset>
  <legend>Apenas obrigatórios?</legend>
  <label><input type="checkbox" bind:checked={settings.current.mandatoryOnly} /> Sim</label>
</fieldset>

<fieldset>
  <legend>Atributos incluídos ({allAttrs.length - settings.current.excludedAttrs.length} / {allAttrs.length})</legend>
  <div class="toolbar">
    <input placeholder="Filtrar por nome" bind:value={filterText} />
    <input placeholder="Filtrar por órgão (ex: ANVISA)" bind:value={bodyFilter} />
    <button onclick={selectAll}>Selecionar todos</button>
    <button onclick={deselectAll}>Desmarcar todos</button>
  </div>
  <div class="attr-list">
    {#each filtered as a}
      <label>
        <input type="checkbox" checked={!isExcluded(a.codigo)} onchange={() => toggle(a.codigo)} />
        <span class="code">{a.codigo}</span> {a.nome_apresentacao}
      </label>
    {/each}
  </div>
</fieldset>

<button onclick={save}>Salvar configurações</button>

<hr />

<h2>Dados</h2>
<button onclick={clearProject}>Limpar projeto (produtos)</button>
<button onclick={clearDb}>Limpar banco NCM/atributos</button>

<style>
  fieldset { margin: 1rem 0; padding: 1rem; }
  .toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
  .attr-list { max-height: 400px; overflow: auto; border: 1px solid #eee; padding: 0.5rem; }
  .attr-list label { display: block; font-size: 0.85rem; }
  .code { color: #06a; font-family: monospace; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/settings/
git commit -m "feat: add settings screen with filter config and data reset"
```

### Task 34: Changelog screen

**Files:**
- Create: `src/routes/changelog/+page.svelte`

- [ ] **Step 1: Implement**

`src/routes/changelog/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db/client';
  import { project } from '$lib/stores/project.svelte';
  import { toCsv } from '$lib/export/csv';
  import { triggerDownload } from '$lib/export/exporter';

  let entries = $state<any[]>([]);
  let typeFilter = $state<string>('');
  let dateFrom = $state<string>('');
  let dateTo = $state<string>('');
  let onlyProject = $state<boolean>(false);
  let projectNcms = $state<string[]>([]);

  const GROUPS: Record<string, string[]> = {
    'NCMs': ['NCM_ADDED', 'NCM_REMOVED', 'NCM_MODIFIED'],
    'Mapeamentos': ['MAP_ADDED', 'MAP_REMOVED', 'MAP_MODIFIED'],
    'Atributos': ['ATTR_DEF_ADDED', 'ATTR_DEF_REMOVED', 'ATTR_DEF_MODIFIED',
                  'COND_ADDED', 'COND_REMOVED', 'COND_MODIFIED',
                  'DOMAIN_VALUE_ADDED', 'DOMAIN_VALUE_REMOVED', 'DOMAIN_VALUE_MODIFIED']
  };

  onMount(async () => {
    await project.load();
    projectNcms = [...new Set(project.products.map(p => p.ncm_code).filter(Boolean) as string[])];
    await load();
  });

  async function load() {
    const clauses: string[] = []; const params: any[] = [];
    if (typeFilter) { clauses.push('change_type = ?'); params.push(typeFilter); }
    if (dateFrom) { clauses.push('logged_at >= ?'); params.push(dateFrom); }
    if (dateTo) { clauses.push('logged_at < ?'); params.push(dateTo + 'T99:99:99'); }
    if (onlyProject && projectNcms.length) {
      clauses.push(`ncm_code IN (${projectNcms.map(() => '?').join(',')})`);
      params.push(...projectNcms);
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    entries = await db.select(`SELECT * FROM changelog ${where} ORDER BY id DESC LIMIT 500`, params);
  }

  async function doExport() {
    const all = await db.select<any>(`SELECT * FROM changelog ORDER BY id`);
    const headers = ['logged_at','update_run_id','change_type','ncm_code','attr_code','field_changed','old_value','new_value'];
    const rows = all.map(r => headers.map(h => r[h]));
    triggerDownload(toCsv(headers, rows), `changelog_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  }
</script>

<h1>Histórico de Mudanças</h1>

<fieldset>
  <legend>Filtros</legend>
  <label>Tipo:
    <select bind:value={typeFilter} onchange={load}>
      <option value="">— todos —</option>
      {#each Object.entries(GROUPS) as [group, types]}
        <optgroup label={group}>
          {#each types as t}<option value={t}>{t}</option>{/each}
        </optgroup>
      {/each}
    </select>
  </label>
  <label>De: <input type="date" bind:value={dateFrom} onchange={load} /></label>
  <label>Até: <input type="date" bind:value={dateTo} onchange={load} /></label>
  <label><input type="checkbox" bind:checked={onlyProject} onchange={load} /> Apenas NCMs do meu projeto</label>
  <button onclick={doExport}>Exportar CSV</button>
</fieldset>

<table>
  <thead><tr><th>Data</th><th>Tipo</th><th>NCM</th><th>Atributo</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
  <tbody>
    {#each entries as e}
      <tr>
        <td>{e.logged_at?.slice(0,19).replace('T',' ')}</td>
        <td>{e.change_type}</td>
        <td>{e.ncm_code ?? ''}</td>
        <td>{e.attr_code ?? ''}</td>
        <td>{e.field_changed ?? ''}</td>
        <td class="clip">{e.old_value ?? ''}</td>
        <td class="clip">{e.new_value ?? ''}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  fieldset { margin: 1rem 0; padding: 1rem; }
  label { display: inline-block; margin-right: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { border: 1px solid #eee; padding: 0.25rem; text-align: left; }
  .clip { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/changelog/
git commit -m "feat: add changelog screen with type/date/project filters and CSV export"
```

---

## Phase 11 — End-to-end tests

### Task 35: Playwright E2E happy-path test

**Files:**
- Create: `tests/e2e/happy-path.spec.ts`
- Create: `playwright.config.ts` (if not already present)

- [ ] **Step 1: Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true
  },
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
```

- [ ] **Step 2: E2E test (uses small fixtures to exercise the flow)**

`tests/e2e/happy-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import path from 'node:path';

test('end-to-end import → classify → export', async ({ page }) => {
  await page.goto('/database');

  // Drop NCM file
  const ncmBuf = readFileSync('tests/fixtures/ncm-sample.json');
  await page.setInputFiles('input[type=file][accept=".json"]', {
    name: 'ncm.json', mimeType: 'application/json', buffer: ncmBuf
  });
  await expect(page.getByText('Importado: 4 códigos')).toBeVisible({ timeout: 15000 });

  // Drop attrs zip
  const attrsJson = readFileSync('tests/fixtures/attrs-sample.json');
  const zipBuf = Buffer.from(zipSync({ 'data.json': new Uint8Array(attrsJson) }));
  await page.setInputFiles('input[type=file][accept=".zip"]', {
    name: 'attrs.zip', mimeType: 'application/zip', buffer: zipBuf
  });
  await expect(page.getByText(/Importado: 2 atributos/)).toBeVisible({ timeout: 15000 });

  // Import products (inline mock CSV)
  const csv = 'id,short,long\nP1,Prod 1,Long desc 1';
  await page.goto('/import');
  await page.setInputFiles('input[type=file][accept=".csv,.xlsx"]', {
    name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)
  });
  await expect(page.getByText('1 linhas')).toBeVisible();
  await page.getByRole('button', { name: /Continuar/ }).click();

  // Map columns
  await page.locator('select').nth(0).selectOption('id');
  await page.locator('select').nth(1).selectOption('short');
  await page.locator('select').nth(2).selectOption('long');
  await page.getByRole('button', { name: /Importar 1 produtos/ }).click();

  // Classify
  await expect(page).toHaveURL(/\/classify/);
  await page.locator('aside ul li button').first().click();
  await page.getByPlaceholder(/Buscar NCM/).fill('raça');
  await page.locator('.results button').first().click();
  await page.getByRole('button', { name: 'Expandir Atributos' }).click();
  await expect(page.locator('table.attrs tbody tr')).toHaveCount(2);

  // Export
  await page.goto('/export');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar' }).click()
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
});
```

- [ ] **Step 3: Run Playwright**

```bash
npx playwright install chromium
npx playwright test
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ playwright.config.ts
git commit -m "test: add end-to-end happy path from import to export"
```

---

## Phase 12 — Deploy

### Task 36: GitLab Pages CI

**Files:**
- Create: `.gitlab-ci.yml`
- Create: `README.md`

- [ ] **Step 1: CI config**

`.gitlab-ci.yml`:

```yaml
image: node:20

stages: [test, build, deploy]

cache:
  paths: [node_modules/]

test:
  stage: test
  script:
    - npm ci
    - npm run test -- --run

build:
  stage: build
  script:
    - npm ci
    - BASE_PATH="/$CI_PROJECT_NAME" npm run build
  artifacts:
    paths: [build/]

pages:
  stage: deploy
  dependencies: [build]
  script:
    - mv build public
  artifacts:
    paths: [public]
  only: [main]
```

- [ ] **Step 2: README**

`README.md`:

```markdown
# NCM Classifier

Static web app for NCM product classification. Runs entirely in the browser.

## Usage

1. Open the hosted URL (once — cached by Service Worker for offline use).
2. Go to **Banco de Dados**, download the two Siscomex files from the linked URLs, and drag them into the app.
3. Go to **Importar** and drop your client's product spreadsheet.
4. Map columns in **Mapear Colunas**.
5. Search and assign NCMs in **Classificar**, then expand attributes and fill values.
6. Export in **Exportar**.

## Development

```
npm install
npm run dev             # http://localhost:5173
npm run test -- --run   # unit + integration
npx playwright test     # e2e
npm run build           # produces build/ folder
```
```

- [ ] **Step 3: Commit and push**

```bash
git add .gitlab-ci.yml README.md
git commit -m "chore: add GitLab Pages CI and README"
# User must manually push to GitLab after confirming remote URL
```

### Task 37: Final validation-mode utility (optional)

**Files:**
- Create: `src/routes/settings/+page.svelte` (already exists — add section)

- [ ] **Step 1: Add a "Validation mode" panel at the bottom of settings**

Append to `src/routes/settings/+page.svelte`:

```svelte
<hr />
<h2>Modo validação</h2>
<p>Compara o export do app com um XLSX de referência (gerado pelo VBA).</p>
<input type="file" accept=".xlsx" onchange={handleValidation} />
<pre id="validation-output">{validationOutput}</pre>

<script context="module" lang="ts">
  // This block is illustrative — add to the existing <script lang="ts"> at top:
</script>
```

Add inside the existing `<script lang="ts">`:

```ts
  import ExcelJS from 'exceljs';
  let validationOutput = $state('');

  async function handleValidation(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await f.arrayBuffer());
    const ref = wb.worksheets[0];
    const refRows: string[][] = [];
    ref.eachRow((r) => refRows.push((r.values as any[]).slice(1).map(v => v == null ? '' : String(v))));

    const ourRows = await db.select<any>(`
      SELECT p.unique_id, r.attr_code, r.attr_counter, r.attr_name, r.attr_mandatory,
             r.attr_fill_type, r.attr_domain_values, r.attr_regulatory_body
      FROM project_product p LEFT JOIN project_attr_row r ON r.product_id = p.id
      ORDER BY p.unique_id, r.attr_counter
    `);
    const refKey = (r: string[]) => `${r[0]}|${r[2]}`;
    const ourKey = (r: any) => `${r.unique_id}|${r.attr_code}`;
    const refKeys = new Set(refRows.slice(1).map(refKey));
    const ourKeys = new Set(ourRows.map(ourKey));

    const missing = [...refKeys].filter(k => !ourKeys.has(k));
    const extra = [...ourKeys].filter(k => !refKeys.has(k));
    validationOutput = `Ref rows: ${refRows.length - 1}\nOur rows: ${ourRows.length}\n` +
      `Missing in ours (first 10): ${missing.slice(0, 10).join(', ')}\n` +
      `Extra in ours (first 10): ${extra.slice(0, 10).join(', ')}`;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/settings/
git commit -m "feat: add validation mode to compare against VBA reference export"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-ncm-classifier-web-app.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
