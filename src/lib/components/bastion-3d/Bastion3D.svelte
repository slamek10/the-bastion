<script lang="ts">
	/**
	 * The whole 3D view: the scene and the HUD over it. Loaded with a dynamic
	 * import, so three and the scene stay out of the server bundle and out of
	 * the overview page.
	 */
	import { untrack } from 'svelte';
	import BastionViewport from './BastionViewport.svelte';
	import BastionHUD from './BastionHUD.svelte';
	import { bastion3d } from '$lib/stores/bastion3d.svelte';

	let { configured, dev = false }: { configured: boolean; dev?: boolean } = $props();

	// untracked: start() reads the store, which mustn't restart this
	$effect(() => {
		const ok = configured;
		untrack(() => bastion3d.start(ok));
		return () => untrack(() => bastion3d.stop());
	});
</script>

<div class="bastion3d">
	<!-- a new quality builds the 3D view again -->
	{#key bastion3d.quality}
		<BastionViewport store={bastion3d} {dev} />
	{/key}
	<BastionHUD store={bastion3d} />
</div>

<style>
	.bastion3d {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
</style>
