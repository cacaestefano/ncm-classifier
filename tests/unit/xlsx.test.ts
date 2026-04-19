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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(buf) as any);
    const sheet = wb.getWorksheet('Classificacao')!;
    expect(sheet.getCell('A1').value).toBe('unique_id');
    expect(sheet.rowCount).toBe(2); // header + 1 data row
  });

  it('uses extra labels as headers when provided', async () => {
    const buf = await buildWorkbook([], { extraLabels: ['SKU', '', '', '', ''], withDropdowns: false });
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(buf) as any);
    const sheet = wb.getWorksheet('Classificacao')!;
    const headers = (sheet.getRow(1).values as any[]).slice(1); // 1-indexed
    expect(headers).toContain('SKU');
  });
});
