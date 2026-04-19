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
        await wb.xlsx.load(await file.arrayBuffer() as any);
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
