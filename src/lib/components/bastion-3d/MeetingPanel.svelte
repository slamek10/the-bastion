<script lang="ts">
	/**
	 * The town-hall meeting: the agents at the table as cards. Chat with one,
	 * or assign it a task (a work order for its app, as "Change the code"
	 * does); the orders given here show on its card. End meeting sends
	 * everyone back to strolling.
	 */
	import Icon from '@iconify/svelte';
	import AgentCard from './AgentCard.svelte';
	import { agentMode } from './agents/agent';
	import { AGENT_IDS } from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let { store }: { store: Bastion3DState } = $props();

	const away = $derived(
		AGENT_IDS.filter((id) => agentMode(id, store.telemetry, Date.now(), true) !== 'MEETING')
	);
</script>

{#if store.meeting.active}
	<section class="meeting glass">
		<header>
			<Icon icon="mdi:account-group" height="1.2rem" />
			<h3>Town hall meeting</h3>
			{#if away.length}
				<span class="pill warn">{away.length} called away</span>
			{/if}
			<span class="spacer"></span>
			<button onclick={() => store.endMeeting()}><Icon icon="mdi:exit-run" /> End meeting</button>
		</header>
		<div class="cards scroll">
			{#each AGENT_IDS as id (id)}
				<AgentCard {store} {id} meeting />
			{/each}
		</div>
	</section>
{/if}

<style>
	.meeting {
		position: absolute;
		left: 50%;
		bottom: 5.4rem;
		transform: translateX(-50%);
		width: min(64rem, calc(100vw - 2rem));
		max-height: 42vh;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.8rem;
		z-index: 12;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
	}

	.spacer {
		flex: 1;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
		gap: 0.5rem;
		align-items: start;
	}
</style>
