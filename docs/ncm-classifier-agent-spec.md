# NCM Classifier — Agent Implementation Spec

## What This Document Is

A platform-agnostic specification for reimplementing the NCM Classifier tool outside of Excel VBA. It describes **what the system does**, **what data it works with**, and **what outputs it produces** — not how to build it in any specific stack.

The current implementation lives in an Excel .xlsm workbook with ~3,400 lines of VBA. Everything described here has been validated in production use.

---

## Problem

Brazilian foreign trade professionals must classify imported/exported products into NCM codes (Nomenclatura Comum do Mercosul) and fill out government-mandated attributes for each code. Today this is done manually — searching the Siscomex portal, reading descriptions, matching attributes by hand, and entering values one by one.

Each client sends product data in a different spreadsheet format with inconsistent column names. A single batch may have hundreds of products, each requiring 5-30+ attributes. The process is slow, repetitive, and error-prone.

## Objective

Build a tool that:

1. **Downloads and caches** the official NCM nomenclature and attributes from the Siscomex public API
2. **Accepts client product data** in any tabular format and lets the user map columns to a standard schema
3. **Provides a search interface** for the user to manually assign NCM codes to each product
4. **Automatically expands** each classified product into one row per required attribute, pre-filled with attribute metadata (name, type, domain values, regulatory body)
5. **Handles conditional attributes** — attributes that only appear based on the value of a parent attribute
6. **Tracks changes** between NCM database updates in an append-only changelog
7. **Exports** the final stacked output for submission to government systems

---

## Data Sources

### 1. NCM Nomenclature API

- **URL**: `https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO`
- **Auth**: None (public endpoint)
- **Method**: GET
- **Format**: JSON (~3 MB)
- **Update frequency**: Daily at midnight (Brasilia time)

**Response structure**:

```json
{
  "Data_Ultima_Atualizacao_NCM": "Vigente em 03/04/2026",
  "Ato": "Resolução Gecex nº 812/2025",
  "Nomenclaturas": [
    {
      "Codigo": "0101.21.00",
      "Descricao": "-- Reprodutores de raça pura",
      "Data_Inicio": "01/04/2022",
      "Data_Fim": "31/12/9999",
      "Tipo_Ato_Ini": "Res Camex",
      "Numero_Ato_Ini": "272",
      "Ano_Ato_Ini": "2021"
    }
  ]
}
```

**Fields per NCM entry**:

| Field | Description |
|-------|-------------|
| `Codigo` | NCM code at any hierarchy level |
| `Descricao` | Official Portuguese description |
| `Data_Inicio` | Start date (dd/mm/yyyy) |
| `Data_Fim` | End date (dd/mm/yyyy), "31/12/9999" means current |
| `Tipo_Ato_Ini` | Regulatory act type |
| `Numero_Ato_Ini` | Act number |
| `Ano_Ato_Ini` | Act year |

**Hierarchy levels** (derived from code format):

| Code pattern | Level | Example | Classifiable? |
|-------------|-------|---------|---------------|
| `01` | Chapter | 01 - Animais vivos | No |
| `01.01` | Heading | 01.01 - Cavalos, asininos e muares, vivos | No |
| `0101.2` | Subheading | 0101.2 - Cavalos | No |
| `0101.21.00` | Item (8-digit) | 0101.21.00 - Reprodutores de raça pura | **Yes** |

Only 8-digit codes are valid for product classification. Higher-level codes exist for navigation and search context. Total: ~10,571 codes across all levels.

### 2. NCM Attributes API

- **URL**: `https://portalunico.siscomex.gov.br/cadatributos/api/atributo-ncm/download/json`
- **Auth**: None (public endpoint)
- **Method**: GET
- **Format**: ZIP containing a single JSON file (~15 MB compressed, ~50 MB uncompressed)
- **Update frequency**: Daily at midnight

**Response structure** (inside the ZIP):

```json
{
  "versao": 282,
  "listaNcm": [
    {
      "codigoNcm": "0101.21.00",
      "listaAtributos": [
        {
          "codigo": "ATT_9332",
          "modalidade": "Importação",
          "obrigatorio": false,
          "multivalorado": true,
          "dataInicioVigencia": "2023-11-06",
          "dataFimVigencia": "9999-12-31"
        }
      ]
    }
  ],
  "detalhesAtributos": [
    {
      "codigo": "ATT_12960",
      "nome": "Destaque vaso de pressão",
      "nomeApresentacao": "Destaque vaso de pressão",
      "definicao": "Informar se o produto é vaso de pressão...",
      "orientacaoPreenchimento": "Selecione a opção adequada...",
      "formaPreenchimento": "LISTA_ESTATICA",
      "dataInicioVigencia": "2024-11-13",
      "dataFimVigencia": "",
      "dominio": [
        { "codigo": "01", "descricao": "Vaso de pressão - produção seriada..." },
        { "codigo": "999", "descricao": "Outros" }
      ],
      "objetivos": [
        { "codigo": "01", "descricao": "Tratamento administrativo" }
      ],
      "orgaos": ["INMETRO"],
      "atributoCondicionante": false,
      "condicionados": null
    }
  ]
}
```

**Three data tables extracted from this JSON**:

#### Table A — NCM-to-Attribute Mappings (~80,000+ rows)

Maps which attributes apply to which NCM codes.

| Field | Source | Description |
|-------|--------|-------------|
| ncm_code | `listaNcm[].codigoNcm` | 8-digit NCM code |
| attr_code | `listaNcm[].listaAtributos[].codigo` | Attribute code (e.g., ATT_9332) |
| modality | `modalidade` | "Importação" or "Exportação" |
| mandatory | `obrigatorio` | Boolean |
| multivalued | `multivalorado` | Boolean |
| start_date | `dataInicioVigencia` | yyyy-mm-dd |
| end_date | `dataFimVigencia` | yyyy-mm-dd or "9999-12-31" |

#### Table B — Attribute Definitions (~1,346 rows)

Metadata for each unique attribute.

| Field | Source | Description |
|-------|--------|-------------|
| attr_code | `detalhesAtributos[].codigo` | Unique attribute ID |
| attr_name | `nome` | Internal name |
| attr_presentation_name | `nomeApresentacao` | Display name (use this in output) |
| definition | `definicao` | What this attribute means |
| fill_instruction | `orientacaoPreenchimento` | How to fill it |
| fill_type | `formaPreenchimento` | One of: LISTA_ESTATICA, BOOLEANO, DATA, TEXTO, NUMERO_INTEIRO, NUMERO_REAL |
| start_date | `dataInicioVigencia` | |
| end_date | `dataFimVigencia` | Empty string or date |
| domain_values | `dominio[]` | Array of {codigo, descricao} pairs (only for LISTA_ESTATICA) |
| objectives | `objetivos[]` | Array of {codigo, descricao} — e.g., Tratamento administrativo, Produto, Duimp, LPCO |
| regulatory_bodies | `orgaos[]` | Array of strings — ANVISA, IBAMA, INMETRO, MAPA, etc. |
| is_conditioning | `atributoCondicionante` | Boolean — if true, this attribute's value gates child attributes |
| conditioned_attrs | `condicionados` | Array of child attribute objects (null if not conditioning) |

#### Table C — Conditional Attributes (Condicionados)

When `atributoCondicionante` is true, the `condicionados` array defines child attributes that appear based on the parent's value.

| Field | Source | Description |
|-------|--------|-------------|
| parent_attr_code | Parent's `codigo` | The conditioning attribute |
| condition_desc | `condicionados[].descricao` | Condition text, e.g., "'ATT_8807' Igual '999'" |
| child_attr_code | `condicionados[].codigo` | Child attribute code |
| child_name | `condicionados[].nome` | |
| child_presentation_name | `condicionados[].nomeApresentacao` | |
| child_mandatory | `condicionados[].obrigatorio` | |
| child_multivalued | `condicionados[].multivalorado` | |
| child_fill_type | `condicionados[].formaPreenchimento` | |
| child_start_date | `condicionados[].dataInicioVigencia` | |
| child_end_date | `condicionados[].dataFimVigencia` | |
| child_domain_values | `condicionados[].dominio` | |
| child_objectives | `condicionados[].objetivos` | |
| child_regulatory_bodies | `condicionados[].orgaos` | |

**Note on domain values**: Some attributes have domain value lists exceeding 32KB when serialized. These are a small minority but must be handled (the VBA version stores them in a separate overflow table).

---

## Data Model

### Input: Client Product Data

Arbitrary tabular data with user-mapped columns:

| Field | Required | Description |
|-------|----------|-------------|
| unique_id | Yes | Client's product identifier |
| short_description | Yes | Brief product name |
| long_description | Yes | Detailed product description |
| extra_1 through extra_5 | No | Up to 5 additional columns the user wants to carry through (with custom labels) |

### Internal: Cached NCM Database

Stored locally after download. Two datasets:

1. **NCM Codes** — 10,571 entries with code, description, level, dates, regulatory act info
2. **Attributes** — Tables A, B, and C described above

A `versao` (version) number from the attributes API tracks whether the data has changed since last download.

### Output: Classified Products with Attributes

**One row per attribute per product** (stacked/vertical format). This is the core output.

| Column | Description |
|--------|-------------|
| unique_id | Product ID (repeated for each attribute row) |
| short_description | Repeated |
| long_description | Repeated |
| extra_1 ... extra_5 | Repeated (with user's custom labels) |
| NCM_code | 8-digit NCM code (repeated) |
| NCM_description | Official description from nomenclature (repeated) |
| attr_counter | Sequential number per product (1, 2, 3...) |
| attr_code | e.g., ATT_12960 |
| attr_name | Presentation name from API |
| attr_mandatory | Yes / No |
| attr_multivalued | Yes / No |
| attr_fill_type | LISTA_ESTATICA / BOOLEANO / DATA / TEXTO / NUMERO_INTEIRO / NUMERO_REAL |
| attr_domain_values | For LISTA_ESTATICA: "01 - Description; 02 - Description; ..." — empty for other types |
| attr_regulatory_body | ANVISA, IBAMA, INMETRO, etc. |
| attr_objective | Tratamento administrativo / Produto / Duimp / LPCO (semicolon-separated if multiple) |
| attr_conditional_on | If conditional: "ATT_XXXX = value". Empty if unconditional |
| attr_value | Empty — user fills this in |

**Example output**:

| unique_id | short_desc | NCM_code | attr_counter | attr_name | attr_mandatory | attr_fill_type | attr_domain_values | attr_regulatory_body | attr_value |
|---|---|---|---|---|---|---|---|---|---|
| PROD-001 | Steel pipe | 7304.19.00 | 1 | Material de fabricacao | Yes | LISTA_ESTATICA | 01 - Aco carbono; 02 - Aco inox; ... | INMETRO | |
| PROD-001 | Steel pipe | 7304.19.00 | 2 | Tipo de tubos | Yes | LISTA_ESTATICA | 01 - Sem costura; 02 - Com costura; ... | INMETRO | |
| PROD-001 | Steel pipe | 7304.19.00 | 3 | Composicao | No | TEXTO | | RECEITA | |

---

## Functional Requirements

### 1. Database Management

- Download and cache both APIs locally
- Track the `versao` number to detect changes
- Compare old vs. new data on update and log differences (ADDED, REMOVED, MODIFIED codes; ATTR_ADDED, ATTR_REMOVED mappings) to an append-only changelog
- Filter out expired entries (`Data_Fim` / `dataFimVigencia` in the past)
- Prompt user to update if cached data is older than 24 hours

### 2. Column Mapping

- Accept arbitrary tabular input (CSV, spreadsheet, etc.)
- Present the user with the input's column headers
- Let the user map 3 required fields (unique_id, short_description, long_description) and up to 5 optional fields with custom labels
- Copy mapped data to a standardized internal schema

### 3. NCM Search and Assignment

- Full-text keyword search across all cached NCM codes and descriptions
- Multi-word search: all words must match (AND logic, case-insensitive)
- Display results with code, description, and hierarchy level
- Prevent selection of non-8-digit codes (chapters, headings, subheadings are for navigation only)
- Auto-fill the official NCM description when a code is selected
- Cap search results at 100 to keep the UI responsive

### 4. Attribute Population

After the user assigns NCM codes, expand each product into attribute rows:

- Look up all attributes mapped to the product's NCM code (Table A)
- Join with attribute definitions (Table B) to get metadata
- Apply filters before output:
  - **Modality filter**: Importação, Exportação, or Both
  - **Mandatory-only toggle**: if on, exclude non-mandatory attributes
  - **Attribute include/exclude list**: user can pre-select which of the 1,346 attributes to include
  - **Expiry filter**: exclude attributes where end_date < today
- For NCM codes with zero attributes (55 codes): output a single row with product data and empty attribute columns
- Serialize domain values as "code - description; code - description; ..."
- Use `nomeApresentacao` (presentation name) for the output attr_name, not `nome`

### 5. Conditional Attributes

134 of the 1,346 attributes are "conditioning" — their value determines whether child attributes should appear.

- After the user fills in attribute values, allow a second pass:
  - For each filled parent attribute, check if the entered value matches any condition in the condicionados
  - If yes, insert child attribute rows below the parent
  - Renumber attr_counter per product after insertion
- Must be safe to re-run (remove previously-added conditional rows before re-processing)

### 6. Attribute Filters (Config)

The user should be able to configure:

| Setting | Options | Default |
|---------|---------|---------|
| Modality | Importação / Exportação / Both | Both |
| Mandatory only | Yes / No | No |
| Attribute include/exclude | Per-attribute toggle across all 1,346 | All included |

Quick-filter actions:
- Select all / Deselect all
- Filter by regulatory body (e.g., show only ANVISA attributes)
- Filter by modality
- Toggle mandatory-only

### 7. Change History

On each database update, diff old vs. new and log:

| Field | Description |
|-------|-------------|
| date | Timestamp of the update |
| change_type | ADDED / REMOVED / MODIFIED / ATTR_ADDED / ATTR_REMOVED |
| NCM_code | Affected code |
| field_changed | Which field changed (for MODIFIED) or attribute code (for ATTR_*) |
| old_value | Previous value |
| new_value | New value |

First-ever download produces no log entries (no prior data to compare).

---

## Data Volume Reference

| Dataset | Approximate size |
|---------|-----------------|
| NCM codes (all levels) | 10,571 entries |
| NCM codes (8-digit / classifiable) | ~10,000 entries |
| Attribute definitions | 1,346 |
| NCM-to-attribute mappings | 80,000+ rows |
| Conditioning attributes | 134 parents with child rules |
| Zero-attribute NCMs | 55 codes |
| NCM nomenclature JSON | ~3 MB |
| Attributes ZIP (compressed) | ~15 MB |
| Attributes JSON (uncompressed) | ~50 MB |

---

## Key Business Rules

1. **NCM assignment is always manual** — the user picks the code. The tool only assists with search.
2. **Attribute population is automatic** — once an NCM code is assigned, the tool knows exactly which attributes to show.
3. **The user fills attribute values by hand** — for LISTA_ESTATICA types, they enter the domain *code* (e.g., "01"), not the description.
4. **Multivalued attributes** accept multiple semicolon-separated codes.
5. **Stacked output format** — one row per attribute, not one row per product with hundreds of attribute columns. This keeps the output manageable and export-friendly.
6. **All data is in Portuguese** — descriptions, attribute names, domain values, regulatory body names.
7. **Dates use Brazilian format** in the NCM API (dd/mm/yyyy) and ISO format in the attributes API (yyyy-mm-dd). Both must be handled.
8. **Regulatory bodies** include: ANVISA, IBAMA, INMETRO, MAPA, RECEITA, DPF, CNEN, ANP, CONFAZ, DECEX, SECEX, and others.
9. **Attribute objectives** include: Tratamento administrativo, Produto, Duimp, LPCO.

---

## What Is NOT In Scope

- AI-powered NCM code suggestion or auto-classification
- Automatic attribute value filling
- Tax rate calculations
- Integration with Siscomex submission systems (DU-IMP, LPCO filing)
- User authentication or multi-user access control
