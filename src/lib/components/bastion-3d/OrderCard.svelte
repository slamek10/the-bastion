<script lang="ts">
	/**
	 * One work order: what you asked, where it is, the orchestrator's plan
	 * with Approve / Ask for changes / Reject while it waits for you, the
	 * commits, and its log.
	 */
	import Icon from '@iconify/svelte';
	import { STATUS_LABEL } from '$lib/orders';
	import { ORDER_DONE, ORDER_REPO, type OrderStatus, type WorkOrder } from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let { store, order }: { store: Bastion3DState; order: WorkOrder } = $props();

	let open = $state(false);
	let changing = $state(false);
	let feedback = $state('');
	let busy = $state(false);
	let error = $state('');

	const STEPS: OrderStatus[] = [
		'new',
		'planning',
		'awaiting_approval',
		'coding',
		'shipping',
		'deployed'
	];
	const stepIndex = $derived.by(() => {
		const map: Partial<Record<OrderStatus, number>> = { approved: 3, ready: 4 };
		return map[order.status] ?? STEPS.indexOf(order.status);
	});
	const done = $derived(ORDER_DONE.includes(order.status));
	const waiting = $derived(order.status === 'awaiting_approval');
	const tone = $derived(
		order.status === 'deployed'
			? 'ok'
			: ['failed', 'rolled_back', 'rejected'].includes(order.status)
				? 'bad'
				: waiting
					? 'warn'
					: ''
	);

	async function answer(action: 'approve' | 'changes' | 'reject' | 'cancel') {
		busy = true;
		error = '';
		const result = await store.answerOrder(
			order.id,
			action,
			action === 'changes' ? feedback : undefined
		);
		busy = false;
		if (!result.ok) error = result.error ?? 'failed';
		else {
			changing = false;
			feedback = '';
		}
	}

	const time = (at: number) =>
		new Date(at).toLocaleString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			day: 'numeric',
			month: 'short'
		});
</script>

<div class="order" class:waiting>
	<button class="head" onclick={() => (open = !open)}>
		<span class="pill {tone}">{STATUS_LABEL[order.status]}</span>
		<span class="request">{order.request}</span>
		<Icon icon={open || waiting ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
	</button>
	<div class="meta dim">
		{order.apps.map((app) => ORDER_REPO[app]).join(', ') || 'any app'} · {order.id} · {time(
			order.createdAt
		)}
	</div>
	{#if !done}
		<div class="steps" aria-hidden="true">
			{#each STEPS as step, i (step)}
				<span class:reached={i <= stepIndex} class:current={i === stepIndex}></span>
			{/each}
		</div>
	{/if}

	{#if open || waiting}
		{#if order.plan}
			<div class="plan scroll">{order.plan}</div>
		{:else if !done}
			<p class="dim small">
				The orchestrator hasn't posted a plan yet{order.status === 'new'
					? ' (is its session on the Mac running?)'
					: ''}.
			</p>
		{/if}
		{#if order.feedback && order.status === 'planning'}
			<p class="small">You asked: {order.feedback}</p>
		{/if}
		{#each order.commits as commit (commit.app + commit.commit)}
			<div class="small mono">
				{ORDER_REPO[commit.app]}
				{commit.branch}
				{commit.commit.slice(0, 7)} — {commit.summary}
			</div>
		{/each}

		{#if waiting}
			{#if changing}
				<textarea bind:value={feedback} rows="3" placeholder="What should the plan do differently?"
				></textarea>
				<div class="buttons">
					<button onclick={() => (changing = false)}>Back</button>
					<button disabled={busy || !feedback.trim()} onclick={() => answer('changes')}>
						<Icon icon="mdi:send" /> Send
					</button>
				</div>
			{:else}
				<div class="buttons">
					<button class="approve" disabled={busy} onclick={() => answer('approve')}>
						<Icon icon="mdi:check" /> Approve
					</button>
					<button disabled={busy} onclick={() => (changing = true)}>
						<Icon icon="mdi:pencil" /> Ask for changes
					</button>
					<button disabled={busy} onclick={() => answer('reject')}>
						<Icon icon="mdi:close" /> Reject
					</button>
				</div>
			{/if}
		{/if}

		{#if open}
			<div class="log">
				{#each order.log as line, i (i)}
					<div class="small"><span class="dim">{time(line.at)} {line.by}:</span> {line.text}</div>
				{/each}
			</div>
			{#if !done && !waiting}
				<button class="cancel" disabled={busy} onclick={() => answer('cancel')}>
					Cancel this order
				</button>
			{/if}
		{/if}
		{#if error}<p class="error small">{error}</p>{/if}
	{/if}
</div>

<style>
	.order {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.55rem 0.6rem;
		border-radius: 0.9rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
	}

	.order.waiting {
		border-color: rgba(251, 191, 36, 0.55);
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
	}

	.head:hover {
		background: none;
	}

	.request {
		flex: 1;
		min-width: 0;
		font-size: 0.84rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta,
	.small {
		font-size: 0.72rem;
	}

	.steps {
		display: flex;
		gap: 0.2rem;
	}

	.steps span {
		flex: 1;
		height: 0.22rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.1);
	}

	.steps span.reached {
		background: var(--accent);
	}

	.steps span.current {
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.4;
		}
	}

	.plan {
		max-height: 16rem;
		white-space: pre-wrap;
		font-size: 0.8rem;
		line-height: 1.4;
		padding: 0.5rem 0.6rem;
		border-radius: 0.7rem;
		background: rgba(0, 0, 0, 0.3);
	}

	.buttons {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.buttons button {
		font-size: 0.78rem;
	}

	.approve {
		background: rgba(74, 222, 128, 0.2);
		border-color: rgba(74, 222, 128, 0.5);
	}

	textarea {
		resize: vertical;
		font-size: 0.82rem;
	}

	.log {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		max-height: 10rem;
		overflow: auto;
	}

	.cancel {
		align-self: flex-start;
		font-size: 0.72rem;
	}

	.error {
		color: var(--bad);
		margin: 0;
	}

	p {
		margin: 0;
	}
</style>
