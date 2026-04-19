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
