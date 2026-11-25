<script lang="ts">
	import Icon from '@iconify/svelte';
	import HlsPreview from './HlsPreview.svelte';
	import { allOf } from '$lib/bindings';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let { store }: { store: Bastion3DState } = $props();

	const cameras = $derived(allOf(store.bindings, 'watchtower', 'camera'));
	const name = (id: string) => String(store.telemetry.ha[id]?.attributes.friendly_name ?? id);
	const close = () => (store.cameraModal = null);
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && close()} />

{#if store.cameraModal !== null}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="backdrop" onclick={close} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="modal glass"
			onclick={(event) => event.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<header>
				<Icon icon="mdi:cctv" height="1.2rem" />
				<h3>{store.cameraModal ? name(store.cameraModal) : 'Camera'}</h3>
				<div class="tabs">
					{#each cameras as id (id)}
						<button
							class:active={id === store.cameraModal}
							onclick={() => (store.cameraModal = id)}
						>
							{name(id)}
						</button>
					{/each}
				</div>
				<button class="icon" onclick={close} aria-label="Close">
					<Icon icon="mdi:close" height="1.2rem" />
				</button>
			</header>
			{#key store.cameraModal}
				<HlsPreview {store} entityId={store.cameraModal} controls />
			{/key}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		padding: 1rem;
	}

	.modal {
		width: min(60rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	h3 {
		margin: 0;
		font-weight: 500;
		font-size: 1rem;
	}

	.tabs {
		display: flex;
		gap: 0.3rem;
		flex: 1;
		flex-wrap: wrap;
	}

	.tabs button.active {
		background: rgba(125, 211, 252, 0.25);
	}
</style>
