<script lang="ts">
	/**
	 * The 3D command center. The scene is imported only here, in the browser,
	 * so the server bundle never loads three. ?demo (or no shared login on the
	 * server) runs the local simulator.
	 */
	import { page } from '$app/state';
	import type { Component } from 'svelte';

	let { data } = $props();
	let View: Component<{ configured: boolean; dev?: boolean }> | undefined = $state();
	let failed = $state('');

	const demo = $derived(page.url.searchParams.has('demo'));

	$effect(() => {
		import('$lib/components/bastion-3d/Bastion3D.svelte')
			.then((module) => (View = module.default))
			.catch((error) => (failed = String(error?.message ?? error)));
	});
</script>

<svelte:head><title>The Bastion · 3D</title></svelte:head>

{#if View}
	<View configured={data.configured && !data.needsLogin && !demo} dev={data.dev} />
{:else}
	<div class="loading">{failed || 'Loading the house…'}</div>
{/if}

<style>
	.loading {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.7;
	}
</style>
