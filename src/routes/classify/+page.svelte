<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '$lib/db/client';
  import { project } from '$lib/stores/project.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let attrRows = $state<any[]>([]);
  let searchTimer: any = null;
  let searchGen = 0;
  let busyMsg = $state('');

  onMount(async () => {
    await project.load();
    await settings.load();
  });

  const selectedCount = $derived(project.selectedIds.size);
  const focusedInSelection = $derived(
    project.selectedId != null && project.selectedIds.has(project.selectedId)
  );
  const currentProduct = $derived(project.products.find(p => p.id === project.selectedId));

  function toggleSelection(id: number) {
    if (project.selectedIds.has(id)) project.selectedIds.delete(id);
    else project.selectedIds.add(id);
  }
  function selectAll() { for (const p of project.products) project.selectedIds.add(p.id); }
  function clearSelection() { project.selectedIds.clear(); }
  const allSelected = $derived(
    project.products.length > 0 && selectedCount === project.products.length
  );
  function toggleAll() { allSelected ? clearSelection() : selectAll(); }

  async function runSearch() {
    if (!searchQuery.trim()) { searchResults = []; return; }
    const gen = ++searchGen;
    try {
      const r = await db.search(searchQuery, true);
      if (gen === searchGen) searchResults = r;
    } catch (e: any) {
      if (gen === searchGen) alert('Erro na busca: ' + (e?.message ?? e));
    }
  }
  function onQueryInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 200);
  }

  async function pick(id: number) {
    project.selectedId = id;
    searchResults = []; searchQuery = '';
    try {
      attrRows = await project.attrRowsFor(id);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function assignFocusedOnly(code: string, description: string) {
    if (!project.selectedId) return;
    try {
      await project.assignNcm(project.selectedId, code, description);
      attrRows = await project.attrRowsFor(project.selectedId);
      searchResults = []; searchQuery = '';
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function assignToSelection(code: string, description: string) {
    if (selectedCount === 0) return;
    busyMsg = `Atribuindo NCM a ${selectedCount} produtos...`;
    try {
      await project.assignNcmMany([...project.selectedIds], code, description);
      if (project.selectedId) attrRows = await project.attrRowsFor(project.selectedId);
      searchResults = []; searchQuery = '';
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
    finally { busyMsg = ''; }
  }

  async function expand() {
    if (!project.selectedId) return;
    try {
      await db.expand(project.selectedId, [...settings.current.modalidades], settings.current.mandatoryOnly, [...settings.current.excludedAttrs]);
      attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function expandSelection() {
    if (selectedCount === 0) return;
    busyMsg = `Expandindo atributos em ${selectedCount} produtos...`;
    try {
      const mods = [...settings.current.modalidades];
      const exc = [...settings.current.excludedAttrs];
      for (const id of project.selectedIds) {
        await db.expand(id, mods, settings.current.mandatoryOnly, exc);
      }
      if (project.selectedId) attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
    finally { busyMsg = ''; }
  }

  async function expandConditionals() {
    if (!project.selectedId) return;
    try {
      await db.expandConditionals(project.selectedId);
      attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function expandConditionalsSelection() {
    if (selectedCount === 0) return;
    busyMsg = `Expandindo condicionais em ${selectedCount} produtos...`;
    try {
      for (const id of project.selectedIds) {
        await db.expandConditionals(id);
      }
      if (project.selectedId) attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
    finally { busyMsg = ''; }
  }

  async function onValueChange(rowId: number, value: string) {
    try {
      await project.setAttrValue(rowId, value);
      const idx = attrRows.findIndex(r => r.id === rowId);
      if (idx >= 0) attrRows[idx].attr_value = value;
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function applyValueToOthers(attrCode: string, value: string) {
    const others = [...project.selectedIds].filter(id => id !== project.selectedId);
    if (others.length === 0) return;
    busyMsg = `Aplicando valor a ${others.length} outros produtos...`;
    try {
      const affected = await project.applyAttrValueToProducts(attrCode, value, others);
      busyMsg = `Aplicado em ${affected} linha(s).`;
      setTimeout(() => { busyMsg = ''; }, 2000);
    } catch (e: any) { busyMsg = ''; alert('Erro: ' + (e?.message ?? e)); }
  }
</script>

<div class="layout">
  <aside>
    <div class="sidebar-head">
      <label class="all">
        <input type="checkbox" checked={allSelected} onchange={toggleAll} />
        todos
      </label>
      <span class="count">{selectedCount} / {project.products.length} sel.</span>
      {#if selectedCount > 0}
        <button class="link" onclick={clearSelection}>limpar</button>
      {/if}
    </div>
    <ul>
      {#each project.products as p}
        <li class:active={p.id === project.selectedId} class:in-selection={project.selectedIds.has(p.id)}>
          <input type="checkbox"
                 checked={project.selectedIds.has(p.id)}
                 onchange={() => toggleSelection(p.id)} />
          <button onclick={() => pick(p.id)}>
            <div>{p.unique_id}</div>
            <small>{p.short_desc}</small>
            <small class="ncm">{p.ncm_code ?? 'sem NCM'}</small>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <section>
    {#if currentProduct}
      <h2>{currentProduct.unique_id}</h2>
      <p><strong>Descrição:</strong> {currentProduct.long_desc}</p>
      <p><strong>NCM:</strong> {currentProduct.ncm_code ?? '—'} {currentProduct.ncm_description ?? ''}</p>

      {#if selectedCount > 0 && !focusedInSelection}
        <p class="banner">{selectedCount} produto(s) selecionado(s) — clique em um deles para aplicar em massa, ou as ações abaixo afetam apenas <strong>{currentProduct.unique_id}</strong>.</p>
      {/if}

      <div class="search">
        <input placeholder="Buscar NCM (ex: tubo aço sem costura)" bind:value={searchQuery} oninput={onQueryInput} />
        {#if searchResults.length}
          <ul class="results">
            {#each searchResults as r}
              <li>
                <span class="result-label">{r.codigo} — {r.descricao}</span>
                <span class="result-actions">
                  <button onclick={() => assignFocusedOnly(r.codigo, r.descricao)}>Atribuir</button>
                  {#if selectedCount > 1 || (selectedCount === 1 && !focusedInSelection)}
                    <button class="bulk" onclick={() => assignToSelection(r.codigo, r.descricao)}>
                      Atribuir aos {selectedCount} sel.
                    </button>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="actions">
        <button onclick={expand} disabled={!currentProduct.ncm_code}>Expandir Atributos</button>
        {#if selectedCount > 1 || (selectedCount === 1 && !focusedInSelection)}
          <button class="bulk" onclick={expandSelection}>Expandir Atributos ({selectedCount})</button>
        {/if}
        <button onclick={expandConditionals} disabled={attrRows.length === 0}>Expandir Condicionais</button>
        {#if selectedCount > 1 || (selectedCount === 1 && !focusedInSelection)}
          <button class="bulk" onclick={expandConditionalsSelection}>Expandir Condicionais ({selectedCount})</button>
        {/if}
      </div>

      {#if busyMsg}<p class="busy">{busyMsg}</p>{/if}

      {#if attrRows.length}
        <table class="attrs">
          <thead>
            <tr><th>#</th><th>Atributo</th><th>Obrig.</th><th>Tipo</th><th>Domínio</th><th>Órgão</th><th>Condicional</th><th>Valor</th></tr>
          </thead>
          <tbody>
            {#each attrRows as r (r.id)}
              <tr class:conditional={r.source === 'conditional'} class:empty={r.source === 'empty_ncm'}>
                <td>{r.attr_counter}</td>
                <td>{r.attr_name ?? '—'}</td>
                <td>{r.attr_mandatory}</td>
                <td>{r.attr_fill_type}</td>
                <td class="dom">{r.attr_domain_values ?? ''}</td>
                <td>{r.attr_regulatory_body ?? ''}</td>
                <td>{r.attr_conditional_on ?? ''}</td>
                <td>
                  <div class="value-cell">
                    {#if r.attr_fill_type === 'LISTA_ESTATICA' && r.attr_domain_values}
                      <select value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLSelectElement).value)}>
                        <option value="">—</option>
                        {#each r.attr_domain_values.split(';').map((s: string) => s.trim()) as opt}
                          {@const code = opt.split(' - ')[0]}
                          <option value={code}>{opt}</option>
                        {/each}
                      </select>
                    {:else if r.attr_fill_type === 'BOOLEANO'}
                      <select value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLSelectElement).value)}>
                        <option value="">—</option><option value="true">Sim</option><option value="false">Não</option>
                      </select>
                    {:else if r.attr_fill_type === 'DATA'}
                      <input type="date" value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLInputElement).value)} />
                    {:else}
                      <input value={r.attr_value} onchange={(e) => onValueChange(r.id, (e.target as HTMLInputElement).value)} />
                    {/if}
                    {#if focusedInSelection && selectedCount > 1 && r.attr_code}
                      <button class="apply-others" title="Aplicar este valor aos outros produtos selecionados"
                              onclick={() => applyValueToOthers(r.attr_code, r.attr_value ?? '')}>
                        ↳ {selectedCount - 1}
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else}
      <p>Selecione um produto à esquerda.</p>
    {/if}
  </section>
</div>

<style>
  .layout { display: grid; grid-template-columns: 320px 1fr; gap: 1rem; }
  aside { border-right: 1px solid #ddd; padding-right: 0.5rem; max-height: 80vh; overflow: auto; }
  .sidebar-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; border-bottom: 1px solid #eee; font-size: 0.85rem; }
  .sidebar-head .all { display: flex; align-items: center; gap: 0.25rem; }
  .sidebar-head .count { color: #666; flex: 1; }
  .sidebar-head .link { background: transparent; border: 0; color: #06a; cursor: pointer; padding: 0; }
  aside ul { list-style: none; padding: 0; margin: 0; }
  aside li { display: flex; align-items: flex-start; gap: 0.25rem; padding: 0.25rem 0.25rem; }
  aside li input[type=checkbox] { margin-top: 0.5rem; }
  aside li button { flex: 1; text-align: left; padding: 0.5rem; border: 0; background: transparent; cursor: pointer; }
  aside li.active button { background: #eef; }
  aside li.in-selection { background: #f4faff; }
  aside small { display: block; color: #666; font-size: 0.75rem; }
  aside small.ncm { color: #06a; }
  .banner { background: #fffae0; border-left: 3px solid #c90; padding: 0.5rem 0.75rem; margin: 0.5rem 0; font-size: 0.85rem; }
  .search input { width: 100%; padding: 0.5rem; }
  .results { list-style: none; padding: 0; max-height: 240px; overflow: auto; border: 1px solid #eee; }
  .results li { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; border-bottom: 1px solid #f4f4f4; }
  .result-label { flex: 1; }
  .result-actions { display: flex; gap: 0.25rem; }
  .results button { padding: 0.25rem 0.5rem; border: 1px solid #ddd; background: #fafafa; cursor: pointer; }
  .results button.bulk { background: #e6f0ff; border-color: #88a; }
  .actions { margin: 1rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .actions button.bulk { background: #e6f0ff; border-color: #88a; }
  .busy { color: #c60; }
  .attrs { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .attrs th, .attrs td { border: 1px solid #eee; padding: 0.25rem; }
  .conditional { background: #fffae0; }
  .empty { color: #999; }
  .dom { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value-cell { display: flex; align-items: center; gap: 0.25rem; }
  .apply-others { background: #e6f0ff; border: 1px solid #88a; padding: 0 0.4rem; cursor: pointer; font-size: 0.8rem; }
</style>
