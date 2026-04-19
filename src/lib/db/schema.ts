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
