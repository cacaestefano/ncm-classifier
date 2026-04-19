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
    FROM ncm_fts
    JOIN ncm n ON n.rowid = ncm_fts.rowid
    WHERE ncm_fts MATCH ?
      ${classifiableOnly ? 'AND n.level = 8' : ''}
    ORDER BY rank, n.codigo
    LIMIT ?
  `;
  return db.selectObjects(sql, [match, limit]) as NcmSearchResult[];
}
