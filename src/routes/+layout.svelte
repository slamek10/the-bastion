<script lang="ts">
	import '$lib/ui.css';
	import { page } from '$app/state';
	import Login from '$lib/components/Login.svelte';

	let { data, children } = $props();

	// the demo needs no server: it opens without a session
	const demo = $derived(page.url.pathname === '/3d' && page.url.searchParams.has('demo'));
</script>

{#if data.needsLogin && !demo}
	<Login passwordLogin={data.passwordLogin} />
{:else}
	{@render children()}
{/if}
