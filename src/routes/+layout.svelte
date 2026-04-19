<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { dbStatus } from '$lib/stores/db-status.svelte';
  import { settings } from '$lib/stores/settings.svelte';

  let { children } = $props();

  const tabs = [
    { href: '/database', label: 'Banco de Dados' },
    { href: '/import', label: 'Importar' },
    { href: '/mapping', label: 'Mapear Colunas' },
    { href: '/classify', label: 'Classificar' },
    { href: '/export', label: 'Exportar' },
    { href: '/settings', label: 'Configurações' },
    { href: '/changelog', label: 'Histórico' }
  ];

  onMount(async () => {
    await dbStatus.refresh();
    await settings.load();
  });
</script>

<nav>
  {#each tabs as t}
    <a href={t.href} class:active={page.url.pathname === t.href}>{t.label}</a>
  {/each}
  <span class="spacer"></span>
  <span class="status">
    {#if dbStatus.hasData}
      {dbStatus.ncmCount} NCMs · v{dbStatus.lastVersao}
    {:else}
      Sem dados. Vá em "Banco de Dados".
    {/if}
  </span>
</nav>

<main>
  {@render children()}
</main>

<style>
  nav { display: flex; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid #ddd; align-items: center; }
  nav a { padding: 0.5rem 0.75rem; border-radius: 4px; color: inherit; text-decoration: none; }
  nav a.active { background: #1a1a1a; color: white; }
  .spacer { flex: 1; }
  .status { font-size: 0.85rem; color: #666; }
  main { padding: 1rem; }
</style>
