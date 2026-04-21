<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db/client';
  import { settings } from '$lib/stores/settings.svelte';
  import { project } from '$lib/stores/project.svelte';
  import { dbStatus } from '$lib/stores/db-status.svelte';
  import ExcelJS from 'exceljs';

  let allAttrs = $state<{codigo: string; nome_apresentacao: string; orgaos_json: string}[]>([]);
  let filterText = $state('');
  let bodyFilter = $state('');
  let validationOutput = $state('');

  onMount(async () => {
    await settings.load();
    allAttrs = await db.select(`SELECT codigo, nome_apresentacao, orgaos_json FROM attribute_def ORDER BY nome_apresentacao`);
  });

  const filtered = $derived(allAttrs.filter(a => {
    if (filterText && !a.nome_apresentacao.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (bodyFilter) {
      try {
        const orgs = JSON.parse(a.orgaos_json || '[]') as string[];
        if (!orgs.includes(bodyFilter)) return false;
      } catch {}
    }
    return true;
  }));

  function isExcluded(code: string) { return settings.current.excludedAttrs.includes(code); }
  function toggle(code: string) {
    const ex = settings.current.excludedAttrs;
    settings.current.excludedAttrs = isExcluded(code) ? ex.filter(c => c !== code) : [...ex, code];
  }
  function selectAll() { settings.current.excludedAttrs = []; }
  function deselectAll() { settings.current.excludedAttrs = allAttrs.map(a => a.codigo); }

  async function save() {
    try {
      await settings.save();
      alert('Salvo');
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? e));
    }
  }

  async function clearProject() {
    if (!confirm('Apagar todos os produtos e classificações? (O banco NCM permanece.)')) return;
    try {
      await project.clear();
      alert('Projeto apagado');
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? e));
    }
  }
  async function clearDb() {
    if (!confirm('Apagar TODO o banco NCM/atributos? Você precisará reimportar.')) return;
    try {
      await db.exec('DELETE FROM ncm');
      await db.exec('DELETE FROM attribute_def');
      await db.exec('DELETE FROM ncm_attr');
      await db.exec('DELETE FROM conditional');
      await db.exec('DELETE FROM changelog');
      await db.exec('DELETE FROM update_run');
      await dbStatus.refresh();
      alert('Banco apagado');
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? e));
    }
  }
  async function handleValidation(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer() as any);
      const ref = wb.worksheets[0];
      const refRows: string[][] = [];
      ref.eachRow((r) => refRows.push((r.values as any[]).slice(1).map(v => v == null ? '' : String(v))));

      const ourRows = await db.select<any>(`
        SELECT p.unique_id, r.attr_code, r.attr_counter, r.attr_name, r.attr_mandatory,
               r.attr_fill_type, r.attr_domain_values, r.attr_regulatory_body
        FROM project_product p LEFT JOIN project_attr_row r ON r.product_id = p.id
        ORDER BY p.unique_id, r.attr_counter
      `);
      const refKey = (r: string[]) => `${r[0]}|${r[2]}`;
      const ourKey = (r: any) => `${r.unique_id}|${r.attr_code}`;
      const refKeys = new Set(refRows.slice(1).map(refKey));
      const ourKeys = new Set(ourRows.map(ourKey));

      const missing = [...refKeys].filter(k => !ourKeys.has(k));
      const extra = [...ourKeys].filter(k => !refKeys.has(k));
      validationOutput = `Ref rows: ${refRows.length - 1}\nOur rows: ${ourRows.length}\n` +
        `Missing in ours (first 10): ${missing.slice(0, 10).join(', ')}\n` +
        `Extra in ours (first 10): ${extra.slice(0, 10).join(', ')}`;
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? e));
    }
  }
</script>

<h1>Configurações</h1>

<fieldset>
  <legend>Nome do projeto</legend>
  <input bind:value={settings.current.projectName} />
</fieldset>

<fieldset>
  <legend>Modalidade</legend>
  <label><input type="checkbox" checked={settings.current.modalidades.includes('Importação')}
    onchange={(e) => {
      const on = (e.target as HTMLInputElement).checked;
      settings.current.modalidades = on
        ? [...settings.current.modalidades, 'Importação' as const]
        : settings.current.modalidades.filter(m => m !== 'Importação');
    }} /> Importação</label>
  <label><input type="checkbox" checked={settings.current.modalidades.includes('Exportação')}
    onchange={(e) => {
      const on = (e.target as HTMLInputElement).checked;
      settings.current.modalidades = on
        ? [...settings.current.modalidades, 'Exportação' as const]
        : settings.current.modalidades.filter(m => m !== 'Exportação');
    }} /> Exportação</label>
</fieldset>

<fieldset>
  <legend>Apenas obrigatórios?</legend>
  <label><input type="checkbox" bind:checked={settings.current.mandatoryOnly} /> Sim</label>
</fieldset>

<fieldset>
  <legend>Atributos incluídos ({allAttrs.length - settings.current.excludedAttrs.length} / {allAttrs.length})</legend>
  <div class="toolbar">
    <input placeholder="Filtrar por nome" bind:value={filterText} />
    <input placeholder="Filtrar por órgão (ex: ANVISA)" bind:value={bodyFilter} />
    <button onclick={selectAll}>Selecionar todos</button>
    <button onclick={deselectAll}>Desmarcar todos</button>
  </div>
  <div class="attr-list">
    {#each filtered as a}
      <label>
        <input type="checkbox" checked={!isExcluded(a.codigo)} onchange={() => toggle(a.codigo)} />
        <span class="code">{a.codigo}</span> {a.nome_apresentacao}
      </label>
    {/each}
  </div>
</fieldset>

<button onclick={save}>Salvar configurações</button>

<hr />

<h2>Dados</h2>
<button onclick={clearProject}>Limpar projeto (produtos)</button>
<button onclick={clearDb}>Limpar banco NCM/atributos</button>

<hr />
<h2>Modo validação</h2>
<p>Compara o export do app com um XLSX de referência (gerado pelo VBA).</p>
<input type="file" accept=".xlsx" onchange={handleValidation} />
<pre id="validation-output">{validationOutput}</pre>

<style>
  fieldset { margin: 1rem 0; padding: 1rem; }
  .toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
  .attr-list { max-height: 400px; overflow: auto; border: 1px solid #eee; padding: 0.5rem; }
  .attr-list label { display: block; font-size: 0.85rem; }
  .code { color: #06a; font-family: monospace; }
</style>
