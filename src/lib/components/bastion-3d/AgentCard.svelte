<script lang="ts">
	/**
	 * An agent as a card: its portrait, name, app and a state dot. At the
	 * meeting table it also has Chat and Assign task, and the orders given to
	 * it there with their status.
	 */
	import Icon from '@iconify/svelte';
	import { AGENT_NAMES, ACCENT, MODE_COLOR, agentMode } from './agents/agent';
	import { AGENT_TARGET, STATUS_LABEL } from '$lib/orders';
	import { ORDER_REPO, type AgentId } from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let {
		store,
		id,
		meeting = false
	}: { store: Bastion3DState; id: AgentId; meeting?: boolean } = $props();

	const APP: Record<AgentId, string> = {
		orchestrator: 'bastion-ai · the-bastion',
		watchdog: 'bastion-watch',
		thermal: 'bastion-heat',
		homekeeper: 'bastion-ha',
		vision: 'bastion-cams'
	};

	const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
	const mode = $derived(agentMode(id, store.telemetry, Date.now(), store.meeting.active));
	const agent = $derived(store.telemetry.agents[id]);
	const orders = $derived(
		(store.meetingOrders[id] ?? [])
			.map((orderId) => (store.telemetry.orders ?? []).find((order) => order.id === orderId))
			.filter((order) => !!order)
	);
	const selected = $derived(store.selection?.kind === 'agent' && store.selection.id === id);

	let task = $state('');
	let busy = $state(false);
	let error = $state('');

	async function assign(event: SubmitEvent) {
		event.preventDefault();
		if (!task.trim()) return;
		busy = true;
		error = '';
		const target = AGENT_TARGET[id];
		const result = await store.assignTask(id, target ? [target] : [], task.trim());
		busy = false;
		if (result.ok) {
			task = '';
			store.assigning = null;
		} else error = result.error ?? 'failed';
	}
</script>

<div
	class="card"
	class:selected
	style="--accent: {hex(ACCENT[id])}; --mode: {hex(MODE_COLOR[mode])}"
>
	<button class="face-row" onclick={() => store.select({ kind: 'agent', id })}>
		<span class="face">
			{#if store.portraits[id]}<img src={store.portraits[id]} alt="" />{:else}<Icon
					icon="mdi:account"
					height="1.6rem"
				/>{/if}
			<span class="dot" title={mode}></span>
		</span>
		<span class="who">
			<strong>{AGENT_NAMES[id]}</strong>
			<span class="dim">{APP[id]}</span>
			<span class="state">{agent?.state === 'waiting' ? 'WAITING' : mode}</span>
		</span>
	</button>

	{#if meeting}
		<div class="actions">
			<button onclick={() => store.select({ kind: 'agent', id })}>
				<Icon icon="mdi:chat" /> Chat
			</button>
			<button
				aria-pressed={store.assigning === id}
				onclick={() => (store.assigning = store.assigning === id ? null : id)}
			>
				<Icon icon="mdi:clipboard-plus" /> Assign task
			</button>
		</div>
		{#if store.assigning === id}
			<form onsubmit={assign}>
				<textarea
					bind:value={task}
					rows="2"
					placeholder={AGENT_TARGET[id]
						? `A change in ${ORDER_REPO[AGENT_TARGET[id]!]}…`
						: 'A change, in any app…'}></textarea>
				<button disabled={busy || !task.trim()}><Icon icon="mdi:file-send" /> File</button>
			</form>
			{#if error}<p class="error">{error}</p>{/if}
		{/if}
		{#each orders as order (order.id)}
			<div class="order" title={order.request}>
				<span class="pill">{STATUS_LABEL[order.status]}</span>
				<span class="text">{order.request}</span>
			</div>
		{/each}
	{/if}
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.5rem;
		border-radius: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		min-width: 0;
	}

	.card.selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, rgba(255, 255, 255, 0.05));
	}

	.face-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		min-width: 0;
	}

	.face-row:hover {
		background: none;
	}

	.face {
		position: relative;
		flex: none;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent) 35%, #1e293b);
		box-shadow: 0 0 0 2px var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.face img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}

	.dot {
		position: absolute;
		right: -0.05rem;
		bottom: -0.05rem;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: var(--mode);
		border: 2px solid #0f172a;
		box-shadow: 0 0 6px var(--mode);
	}

	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-size: 0.78rem;
		line-height: 1.25;
	}

	.who strong {
		font-weight: 500;
		font-size: 0.86rem;
	}

	.who .dim,
	.state {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.state {
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--mode);
	}

	.actions {
		display: flex;
		gap: 0.3rem;
	}

	.actions button {
		font-size: 0.72rem;
		padding: 0.25rem 0.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	textarea {
		resize: vertical;
		font-size: 0.8rem;
	}

	form button {
		align-self: flex-end;
		font-size: 0.75rem;
	}

	.order {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		font-size: 0.72rem;
		min-width: 0;
	}

	.order .text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error {
		color: var(--bad);
		font-size: 0.72rem;
		margin: 0;
	}
</style>
