# NCM Classifier Web App — Design

**Status:** Approved for implementation planning
**Date:** 2026-04-18
**Source spec:** [`docs/ncm-classifier-agent-spec.md`](../../ncm-classifier-agent-spec.md)

## Summary

A browser-only static web application that replaces the existing Excel VBA NCM Classifier. Runs offline after first load. Single-user, local, no auth. Ships as a hosted static site (GitLab/GitHub Pages) that the user visits once to cache, then runs from the browser's Service Worker indefinitely.

## Hard constraints (from user)

- **No installs on the work PC.** Browser-only. The user cannot install Python, Node, desktop apps, or binaries.
- **Offline after initial data download.** Siscomex APIs are slow and not always reachable.
- **Portuguese data.** All source strings, tokenization, and display in pt-BR.
- **~50 MB uncompressed attributes JSON.** Must be parseable and storable without freezing the UI or blowing memory.
- **Export as CSV and XLSX.**
- **CORS-blocked Siscomex.** Verified at design time: `fetch()` against `portalunico.siscomex.gov.br` from a `data:` origin returned "No Access-Control-Allow-Origin header". All data refreshes are drag-and-drop of files the user downloads via direct browser navigation (which doesn't hit CORS).
- **Browser reachability tests passed:** GitLab Pages, Siscomex direct download, and OPFS all confirmed working on the target work PC (Microsoft Edge).

## Scope

**In scope:**
- Download-and-cache Siscomex NCM nomenclature and attributes (via user-mediated file drop)
- Column mapping of arbitrary client spreadsheets
- Full-text NCM search and manual assignment
- Automatic attribute expansion with filters and conditional-attribute second pass
- Append-only changelog with before/after values across NCMs, mappings, attribute definitions, and conditional rules
- CSV/XLSX export with optional dropdown validation
- Validation mode for byte-level output comparison against the current VBA tool

**Out of scope:**
- AI/automated NCM suggestion
- Tax calculations
- Siscomex submission integrations (DU-IMP, LPCO)
- Multi-user / authentication

## Tech stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Svelte 5 + SvelteKit (static adapter) | Smallest bundle; runes match the reactive search/filter UX; static adapter deploys cleanly to Pages |
| Build | Vite | SvelteKit's default; PWA plugin with ~0 config |
| Storage | `@sqlite.org/sqlite-wasm` + OPFS VFS | FTS5 for NCM search; 80K-row joins; persistent across reloads |
| Unzip | `fflate` | ~8 KB, streaming |
| XLSX | `exceljs` | Dropdown validation for LISTA_ESTATICA |
| CSV | hand-rolled | No dependency |
| Virtualization | `svelte-virtual` | Rendering 80K attribute-config rows |
| Offline | `vite-plugin-pwa` | Service Worker + manifest |

**Approximate first-load bundle:** ~2.3 MB (SQLite WASM dominates). Cached forever by Service Worker.

## Architecture

```
Browser tab (work PC)
├── UI (Svelte 5) ──► App state (runes)
│                         │
│                         ▼
├── Data Service (TS) ────► Web Worker
│     importNcm(file)          ├── fflate unzip
│     importAttrs(file)        ├── JSON.parse
│     searchNcm(query)         └── bulk INSERT
│     expandAttrs(ncmCode)
│     exportResults()
│         │
│         ▼
├── SQLite-WASM (OPFS-backed, persistent)
└── Service Worker (offline shell)

 ▲
 │ manual file drop (user-mediated)
 │
 Siscomex public URLs (opened in separate browser tab)
```

All heavy work (unzip, parse, bulk insert, diff) runs in a Web Worker so the UI thread never blocks.

### Data lifecycle

1. **First run:** empty DB. User downloads Siscomex files in a separate tab, drags them into the `/database` screen. Worker parses, inserts, no diff (nothing prior).
2. **Subsequent updates:** worker loads new data into shadow tables, diffs against live tables, writes changelog entries with a shared `update_run_id`, atomically swaps shadow → live.
3. **Working session:** all queries hit local SQLite. No network required.
4. **Export:** worker streams rows into XLSX/CSV, downloaded via Blob URL.

## Schema

```sql
-- NCM nomenclature (all hierarchy levels)
ncm (codigo TEXT PK, descricao TEXT, level INTEGER,
     data_inicio TEXT, data_fim TEXT,
     tipo_ato_ini TEXT, numero_ato_ini TEXT, ano_ato_ini TEXT,
     is_classifiable BOOLEAN GENERATED AS (level = 8) VIRTUAL)
CREATE VIRTUAL TABLE ncm_fts USING fts5(
  codigo, descricao, content='ncm',
  tokenize='unicode61 remove_diacritics 1');

-- Attribute definitions (~1,346)
attribute_def (codigo TEXT PK, nome, nome_apresentacao, definicao,
               orientacao_preenchimento, forma_preenchimento,
               data_inicio, data_fim,
               dominio_json, objetivos_json, orgaos_json,
               atributo_condicionante BOOLEAN)

-- NCM-to-attribute mapping (~80K)
ncm_attr (ncm_code, attr_code, modalidade, obrigatorio, multivalorado,
          data_inicio, data_fim,
          PRIMARY KEY (ncm_code, attr_code, modalidade))
CREATE INDEX idx_ncm_attr_ncm ON ncm_attr(ncm_code);
CREATE INDEX idx_ncm_attr_attr ON ncm_attr(attr_code);

-- Conditional children
conditional (id PK, parent_attr_code, condition_desc,
             parent_operator, parent_value,
             child_attr_code, child_nome, child_nome_apresentacao,
             child_obrigatorio, child_multivalorado,
             child_forma_preenchimento,
             child_dominio_json, child_objetivos_json, child_orgaos_json)
CREATE INDEX idx_cond_parent ON conditional(parent_attr_code);

-- Append-only changelog
changelog (id PK, update_run_id, change_type, ncm_code, attr_code,
           field_changed, old_value, new_value, logged_at)

-- One row per refresh run
update_run (id PK, run_at, ncm_source_ato, ncm_data_atualizacao,
            attr_versao, ncm_count, attr_count, mapping_count)

-- App settings (key/value JSON)
settings (key TEXT PK, value_json TEXT)

-- User project data
project_product (id PK, unique_id, short_desc, long_desc,
                 extra_1..extra_5, ncm_code, ncm_description)
project_attr_row (id PK, product_id, attr_counter,
                  attr_code, attr_name,
                  attr_mandatory, attr_multivalued, attr_fill_type,
                  attr_domain_values, attr_regulatory_body, attr_objective,
                  attr_conditional_on, attr_value,
                  source TEXT  -- 'base' | 'conditional' | 'empty_ncm'
                 )
project_meta (key TEXT PK, value TEXT)
```

## Change tracking

Tracked change types on each data refresh:

| Type | Meaning |
|---|---|
| `NCM_ADDED` / `NCM_REMOVED` / `NCM_MODIFIED` | Nomenclature changes, per field |
| `MAP_ADDED` / `MAP_REMOVED` / `MAP_MODIFIED` | NCM↔attribute mapping changes |
| `ATTR_DEF_ADDED` / `ATTR_DEF_REMOVED` / `ATTR_DEF_MODIFIED` | Attribute definition changes |
| `COND_ADDED` / `COND_REMOVED` / `COND_MODIFIED` | Conditional rule changes |
| `DOMAIN_VALUE_ADDED` / `DOMAIN_VALUE_REMOVED` / `DOMAIN_VALUE_MODIFIED` | Fine-grained LISTA_ESTATICA domain changes |

All modifications preserve old and new values. Changelog is append-only (never mutated) and grouped by `update_run_id`.

## Core logic

### NCM search

FTS5 query with `unicode61 remove_diacritics=1`. Multi-word input becomes `word1* AND word2* AND ...`. Classifiable-only toggle filters to `level=8`. Results capped at 100, sortable by FTS rank or code.

### Attribute expansion

SQL that joins `ncm_attr → attribute_def`, applying filters:

- Modalidade (Importação / Exportação / both)
- Mandatory-only toggle
- Exclusion list of attribute codes
- Expiry (`data_fim >= today`)

NCMs with zero qualifying attributes emit one placeholder row with `source='empty_ncm'` so the product isn't lost.

Domain values serialized as `"01 - Aço carbono; 02 - Aço inox; ..."` at export time (stored as JSON internally for queryability).

Uses `nome_apresentacao` for display, not `nome`.

### Conditional attributes (two-pass)

1. First pass: expand all unconditional attributes. User fills values.
2. User clicks "Expand Conditionals."
3. Delete existing `source='conditional'` rows for that product.
4. For each filled parent attribute where `atributo_condicionante=true`, query `conditional` table for matching rules.
5. Insert children immediately after parent, annotated with `attr_conditional_on = "ATT_X = V"`.
6. Renumber `attr_counter` per product.

Condition parsing normalizes the `descricao` string (`"'ATT_8807' Igual '999'"`) into `parent_operator` + `parent_value` columns at import time. Operators handled: `Igual`, `Diferente`, `Contido em`, `Preenchido`. Unknown operators are stored verbatim and surfaced in a log.

## UI screens

Top-bar navigation: **Database · Import · Map Columns · Classify · Export · Settings · Changelog**

1. **Database** (`/database`) — Version summary, two labeled download-buttons (open Siscomex URLs in new tabs), two drop zones, import progress bar, last-update summary with link to changelog.
2. **Import Products** (`/import`) — Drop zone for CSV/XLSX, first-20-row preview, header list, "Next" button.
3. **Map Columns** (`/mapping`) — Three required field mappings + five optional with custom labels. Validation prevents dupes / unmapped requireds.
4. **Classify** (`/classify`) — Split view: product list (left) + classification detail (right). NCM live search, expand-attributes action, inline-editable attribute table with type-aware inputs (dropdowns for LISTA_ESTATICA, date picker for DATA, etc.), "Expand Conditionals" action.
5. **Export** (`/export`) — Summary counts, unfilled-mandatory warning, format picker (CSV/XLSX), XLSX dropdown-validation toggle, download button.
6. **Settings** (`/settings`) — Attribute filter config (modalidade, mandatory-only, per-attribute include/exclude with quick filters by regulatory body and modalidade, virtualized 1,346-row list). Plus: clear project, clear DB, backup/restore full OPFS SQLite file.
7. **Changelog** (`/changelog`) — Date range filter, grouped type filter (NCMs / Mappings / Attributes), "only changes affecting my project" toggle, paginated before/after table, CSV export.

## Migration & validation

Strategy: produce byte-identical output to the VBA tool for known inputs.

1. **Baseline:** run 3-5 representative input spreadsheets through the current Excel tool, save outputs.
2. **Replay:** import the same inputs, assign same NCMs, apply identical filter settings in the new app.
3. **Validation mode** (Settings screen utility): load both reference XLSX and new-app export, compare row-by-row on key columns (`unique_id`, `attr_code`, `attr_counter`, `attr_name`, `attr_mandatory`, `attr_fill_type`, `attr_domain_values`, `attr_regulatory_body`). Report mismatches.
4. **Acceptable differences:**
   - Ordering within equal `(mandatory, attr_code)` tuples — resolved by explicit tie-break on `attr_code`
   - Whitespace in `attr_domain_values` serialization — normalize both sides
   - Zero-attribute NCMs — confirm both emit the placeholder row
5. **Investigable failures:**
   - Missing `attr_code` on one side → filter divergence
   - Different domain lists → parse or serialization divergence
   - Conditional children mismatched → operator-parsing divergence
6. **Cutover:** after 3 consecutive byte-identical runs, retire VBA. Keep VBA read-only for ~60 days.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| 50 MB JSON parse spikes memory | Runs in Web Worker; isolated from UI; ~200 MB peak is fine on modern laptops |
| OPFS quota on work PC | Full DB ~25-35 MB; well under typical quotas. App shows storage usage in Settings |
| Work network blocks GitLab Pages | Verified reachable at design time (Test 1). If ever blocked, host on any internal static server |
| Siscomex changes API response shape | Parser validates expected keys at import; fails loudly with the observed shape rather than silently corrupting data |
| User clears browser data and loses project | Settings screen offers "Export DB backup" (downloads raw SQLite file) + "Import DB backup" |
| Some domain lists exceed 32 KB (per spec) | SQLite TEXT has no practical size limit; stored as JSON directly, no overflow table needed |

## Open questions (to resolve during planning)

- Exact self-host location (GitLab.com Pages vs. internal GitLab — doesn't affect design, does affect deploy step)
- Whether "Validation Mode" warrants its own screen or stays a Settings utility (leaning utility until proven otherwise)
- Whether to pre-bake a known-good seed dataset in dev builds to speed testing (likely yes)

---

_Note: this workspace is not a git repository yet. The design was not committed to git; the implementation plan will include a first task to `git init` and commit._
