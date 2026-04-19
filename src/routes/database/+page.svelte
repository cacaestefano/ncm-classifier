<script lang="ts">
  import { db } from '$lib/db/client';
  import { dbStatus } from '$lib/stores/db-status.svelte';

  const NCM_URL = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';
  const ATTR_URL = 'https://portalunico.siscomex.gov.br/cadatributos/api/atributo-ncm/download/json';

  let ncmStatus = $state<string>('');
  let attrStatus = $state<string>('');
  let busy = $state(false);

  async function handleNcmDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0]; if (!f) return;
    await importNcm(f);
  }
  async function handleNcmPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    await importNcm(f);
  }
  async function importNcm(file: File) {
    busy = true; ncmStatus = 'Lendo arquivo...';
    try {
      const text = await file.text();
      ncmStatus = 'Processando NCM...';
      await db.importNcm(text);
      await dbStatus.refresh();
      ncmStatus = `Importado: ${dbStatus.ncmCount} códigos`;
    } catch (e: any) { ncmStatus = 'Erro: ' + e.message; }
    finally { busy = false; }
  }

  async function handleAttrDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0]; if (!f) return;
    await importAttrs(f);
  }
  async function handleAttrPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    await importAttrs(f);
  }
  async function importAttrs(file: File) {
    busy = true; attrStatus = 'Lendo ZIP...';
    try {
      const ab = await file.arrayBuffer();
      attrStatus = 'Descompactando e processando...';
      await db.importAttrs(new Uint8Array(ab));
      await dbStatus.refresh();
      attrStatus = `Importado: ${dbStatus.attrCount} atributos, ${dbStatus.mappingCount} mapeamentos`;
    } catch (e: any) { attrStatus = 'Erro: ' + e.message; }
    finally { busy = false; }
  }
</script>

<h1>Banco de Dados</h1>
<p>
  <strong>Status:</strong>
  {#if dbStatus.hasData}
    {dbStatus.ncmCount} NCMs, {dbStatus.attrCount} atributos, versão {dbStatus.lastVersao} (atualizado: {dbStatus.lastDataAtualizacao})
  {:else}
    Ainda não há dados. Baixe os dois arquivos abaixo.
  {/if}
</p>

<div class="grid">
  <section ondragover={(e) => e.preventDefault()} ondrop={handleNcmDrop}>
    <h2>Nomenclatura NCM</h2>
    <a href={NCM_URL} target="_blank" rel="noopener">Baixar do Siscomex ↗</a>
    <p>Arraste o arquivo JSON aqui, ou:</p>
    <input type="file" accept=".json" onchange={handleNcmPick} disabled={busy} />
    {#if ncmStatus}<p class="status">{ncmStatus}</p>{/if}
  </section>

  <section ondragover={(e) => e.preventDefault()} ondrop={handleAttrDrop}>
    <h2>Atributos NCM (ZIP)</h2>
    <a href={ATTR_URL} target="_blank" rel="noopener">Baixar do Siscomex ↗</a>
    <p>Arraste o arquivo ZIP aqui, ou:</p>
    <input type="file" accept=".zip" onchange={handleAttrPick} disabled={busy} />
    {#if attrStatus}<p class="status">{attrStatus}</p>{/if}
  </section>
</div>

{#if busy}<p class="busy">Processando… pode levar até 30 segundos.</p>{/if}

<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
  section { border: 2px dashed #ccc; padding: 1rem; border-radius: 8px; }
  .status { color: #090; }
  .busy { color: #c60; }
</style>
