<script lang="ts">
	/**
	 * Which Home Assistant entities drive which room (data/bindings.json): a
	 * room's list, and a searchable list of every entity The Bastion sees.
	 */
	import { untrack } from 'svelte';
	import Icon from '@iconify/svelte';
	import { ROOM_HINTS, ROOM_LABELS } from '$lib/bindings';
	import { ROOM_IDS, type Bindings, type RoomId } from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let { store }: { store: Bastion3DState } = $props();

	// a copy to edit, taken when the panel opens
	let draft: Bindings = $state(
		untrack(() => structuredClone($state.snapshot(store.bindings)) as Bindings)
	);
	let room: RoomId = $state('cottage');
	let query = $state('');
	let saving = $state(false);
	let saved = $state('');

	const all = $derived(
		Object.values(store.telemetry.ha).sort((a, b) => a.entity_id.localeCompare(b.entity_id))
	);
	const matches = $derived.by(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		return all
			.filter((entity) => !draft[room].includes(entity.entity_id))
			.filter((entity) => {
				const text = `${entity.entity_id} ${entity.attributes.friendly_name ?? ''}`.toLowerCase();
				return words.every((word) => text.includes(word));
			})
			.slice(0, 60);
	});

	const label = (id: string) => String(store.telemetry.ha[id]?.attributes.friendly_name ?? id);

	async function save() {
		saving = true;
		const ok = await store.saveBindings($state.snapshot(draft) as Bindings);
		saving = false;
		saved = ok ? 'Saved' : 'Could not save';
		setTimeout(() => (saved = ''), 2500);
	}

	const close = () => (store.settingsOpen = false);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" onclick={close} role="presentation">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="panel glass"
		onclick={(event) => event.stopPropagation()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<header>
			<Icon icon="mdi:link-variant" height="1.2rem" />
			<h3>Bindings</h3>
			<span class="dim small">
				{store.mode === 'demo' ? 'demo: not saved to the server' : 'data/bindings.json'}
			</span>
			<button class="icon" onclick={close} aria-label="Close">
				<Icon icon="mdi:close" height="1.1rem" />
			</button>
		</header>
		<div class="rooms">
			{#each ROOM_IDS as id (id)}
				<button class:active={room === id} onclick={() => (room = id)}>
					{ROOM_LABELS[id]} <span class="dim">{draft[id].length}</span>
				</button>
			{/each}
		</div>
		<p class="dim small">
			{ROOM_LABELS[room]}: {ROOM_HINTS[room]}. The first entity of a domain drives the room's
			object.
		</p>
		<div class="columns">
			<div class="col">
				<h4>Bound</h4>
				<div class="list scroll">
					{#each draft[room] as id, i (id)}
						<div class="item">
							<span class="mono">{i + 1}</span>
							<span class="name" title={id}>
								{label(id)}<br /><span class="dim mono">{id}</span>
							</span>
							<button
								class="icon"
								disabled={i === 0}
								onclick={() => {
									const list = draft[room];
									[list[i - 1], list[i]] = [list[i], list[i - 1]];
								}}
								aria-label="Up"
							>
								<Icon icon="mdi:arrow-up" />
							</button>
							<button
								class="icon"
								onclick={() => (draft[room] = draft[room].filter((x) => x !== id))}
								aria-label="Remove"
							>
								<Icon icon="mdi:close" />
							</button>
						</div>
					{:else}
						<p class="dim small">Nothing bound.</p>
					{/each}
				</div>
			</div>
			<div class="col">
				<h4>Add</h4>
				<input bind:value={query} placeholder="Search {all.length} entities…" />
				<div class="list scroll">
					{#each matches as entity (entity.entity_id)}
						<button class="add" onclick={() => draft[room].push(entity.entity_id)}>
							<Icon icon="mdi:plus" />
							<span class="name">
								{label(entity.entity_id)}<br /><span class="dim mono">{entity.entity_id}</span>
							</span>
						</button>
					{:else}
						<p class="dim small">
							{all.length ? 'No match.' : 'No entities: Home Assistant is not connected.'}
						</p>
					{/each}
				</div>
			</div>
		</div>
		<footer>
			<span class="dim">{saved}</span>
			<button onclick={save} disabled={saving}><Icon icon="mdi:content-save" /> Save</button>
		</footer>
	</div>
</div>

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

	.panel {
		width: min(52rem, 100%);
		max-height: calc(100dvh - 2rem);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	header,
	footer {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	header h3 {
		margin: 0;
		font-weight: 500;
		flex: 0;
	}

	header .small {
		flex: 1;
	}

	footer {
		justify-content: flex-end;
	}

	.rooms {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.small {
		font-size: 0.78rem;
		margin: 0;
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
		min-height: 0;
		flex: 1;
	}

	@media (max-width: 640px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-height: 0;
	}

	h4 {
		margin: 0;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.6;
		font-weight: 500;
	}

	.list {
		max-height: 22rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.item,
	.add {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		text-align: left;
	}

	.item {
		padding: 0.3rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.add {
		width: 100%;
		border-color: transparent;
		background: transparent;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
