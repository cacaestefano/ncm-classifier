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
                  'COND_ADDED', 'COND_REMOVED',
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
    try {
      entries = await db.select(`SELECT * FROM changelog ${where} ORDER BY id DESC LIMIT 500`, params);
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? e));
    }
  }

  async function doExport() {
    try {
      const all = await db.select<any>(`SELECT * FROM changelog ORDER BY id`);
      const headers = ['logged_at','update_run_id','change_type','ncm_code','attr_code','field_changed','old_value','new_value'];
      const rows = all.map(r => headers.map(h => r[h]));
      triggerDownload(toCsv(headers, rows), `changelog_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? e));
    }
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
