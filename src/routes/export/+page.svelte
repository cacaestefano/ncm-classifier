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
