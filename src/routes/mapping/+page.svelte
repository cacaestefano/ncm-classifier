<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { project } from '$lib/stores/project.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  let headers = $state<string[]>([]);
  let rows = $state<string[][]>([]);

  let uniqueIdCol = $state('');
  let shortDescCol = $state('');
  let longDescCol = $state('');
  let extraCols = $state<[string, string, string, string, string]>(['', '', '', '', '']);
  let extraLabels = $state<[string, string, string, string, string]>(['', '', '', '', '']);
  let error = $state<string>('');

  $effect(() => {
    const h = sessionStorage.getItem('import:headers');
    const r = sessionStorage.getItem('import:rows');
    if (h) headers = JSON.parse(h);
    if (r) rows = JSON.parse(r);
  });

  function indexOf(col: string) { return col ? headers.indexOf(col) : -1; }

  async function commit() {
    error = '';
    if (!uniqueIdCol || !shortDescCol || !longDescCol) {
      error = 'Os 3 campos obrigatórios devem ser mapeados'; return;
    }
    const u = indexOf(uniqueIdCol), s = indexOf(shortDescCol), l = indexOf(longDescCol);
    const e = extraCols.map(indexOf);
    const productRows = rows.map(r => ({
      unique_id: r[u] ?? '',
      short_desc: r[s] ?? '',
      long_desc: r[l] ?? '',
      extra_1: e[0] >= 0 ? r[e[0]] ?? '' : null,
      extra_2: e[1] >= 0 ? r[e[1]] ?? '' : null,
      extra_3: e[2] >= 0 ? r[e[2]] ?? '' : null,
      extra_4: e[3] >= 0 ? r[e[3]] ?? '' : null,
      extra_5: e[4] >= 0 ? r[e[4]] ?? '' : null,
      ncm_code: null, ncm_description: null
    }));

    await project.clear();
    await project.addMany(productRows);
    settings.current.extraLabels = extraLabels;
    await settings.save();
    goto(`${base}/classify`);
  }
</script>

<h1>Mapear Colunas</h1>

{#if headers.length === 0}
  <p>Nenhum arquivo importado. <a href="{base}/import">Voltar</a>.</p>
{:else}
  <fieldset>
    <legend>Obrigatórios</legend>
    <label>ID único
      <select bind:value={uniqueIdCol}>
        <option value="">— escolher —</option>
        {#each headers as h}<option>{h}</option>{/each}
      </select>
    </label>
    <label>Descrição curta
      <select bind:value={shortDescCol}>
        <option value="">— escolher —</option>
        {#each headers as h}<option>{h}</option>{/each}
      </select>
    </label>
    <label>Descrição longa
      <select bind:value={longDescCol}>
        <option value="">— escolher —</option>
        {#each headers as h}<option>{h}</option>{/each}
      </select>
    </label>
  </fieldset>

  <fieldset>
    <legend>Colunas extras (opcionais)</legend>
    {#each [0,1,2,3,4] as i (i)}
      <div class="extra">
        <input placeholder="Rótulo exibido" bind:value={extraLabels[i]} />
        <select bind:value={extraCols[i]}>
          <option value="">— não usar —</option>
          {#each headers as h}<option>{h}</option>{/each}
        </select>
      </div>
    {/each}
  </fieldset>

  {#if error}<p class="error">{error}</p>{/if}
  <button onclick={commit}>Importar {rows.length} produtos</button>
{/if}

<style>
  fieldset { margin: 1rem 0; padding: 1rem; }
  label { display: block; margin: 0.5rem 0; }
  .extra { display: flex; gap: 0.5rem; margin: 0.25rem 0; }
  .error { color: #c00; }
</style>
