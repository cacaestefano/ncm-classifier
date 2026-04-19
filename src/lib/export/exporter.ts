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
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
