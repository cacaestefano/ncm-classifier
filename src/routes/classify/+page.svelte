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

  onMount(async () => {
    await project.load();
    await settings.load();
  });

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

  async function assign(code: string, description: string) {
    if (!project.selectedId) return;
    try {
      await project.assignNcm(project.selectedId, code, description);
      attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function expand() {
    if (!project.selectedId) return;
    try {
      await db.expand(project.selectedId, settings.current.modalidades, settings.current.mandatoryOnly, settings.current.excludedAttrs);
      attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function expandConditionals() {
    if (!project.selectedId) return;
    try {
      await db.expandConditionals(project.selectedId);
      attrRows = await project.attrRowsFor(project.selectedId);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  async function onValueChange(rowId: number, value: string) {
    try {
      await project.setAttrValue(rowId, value);
    } catch (e: any) { alert('Erro: ' + (e?.message ?? e)); }
  }

  const currentProduct = $derived(project.products.find(p => p.id === project.selectedId));
</script>

<div class="layout">
  <aside>
    <h2>Produtos ({project.products.length})</h2>
    <ul>
      {#each project.products as p}
        <li class:active={p.id === project.selectedId}>
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

      <div class="search">
        <input placeholder="Buscar NCM (ex: tubo aço sem costura)" bind:value={searchQuery} oninput={onQueryInput} />
        {#if searchResults.length}
          <ul class="results">
            {#each searchResults as r}
              <li><button onclick={() => assign(r.codigo, r.descricao)}>{r.codigo} — {r.descricao}</button></li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="actions">
        <button onclick={expand} disabled={!currentProduct.ncm_code}>Expandir Atributos</button>
        <button onclick={expandConditionals} disabled={attrRows.length === 0}>Expandir Condicionais</button>
      </div>

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
  .layout { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; }
  aside { border-right: 1px solid #ddd; padding-right: 0.5rem; max-height: 80vh; overflow: auto; }
  aside ul { list-style: none; padding: 0; margin: 0; }
  aside li button { width: 100%; text-align: left; padding: 0.5rem; border: 0; background: transparent; cursor: pointer; }
  aside li.active button { background: #eef; }
  aside small { display: block; color: #666; font-size: 0.75rem; }
  aside small.ncm { color: #06a; }
  .search input { width: 100%; padding: 0.5rem; }
  .results { list-style: none; padding: 0; max-height: 200px; overflow: auto; border: 1px solid #eee; }
  .results button { width: 100%; text-align: left; padding: 0.25rem; border: 0; background: transparent; cursor: pointer; }
  .actions { margin: 1rem 0; display: flex; gap: 0.5rem; }
  .attrs { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .attrs th, .attrs td { border: 1px solid #eee; padding: 0.25rem; }
  .conditional { background: #fffae0; }
  .empty { color: #999; }
  .dom { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
