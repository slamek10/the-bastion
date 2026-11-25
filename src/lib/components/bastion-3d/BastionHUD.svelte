<script lang="ts">
	/**
	 * The glass panels over the scene: a top bar, the left dock (event feed,
	 * Live/Demo, the demo's simulation triggers), the inspector on the right,
	 * the presets and Twilight/Day at the bottom, the camera modal and the
	 * bindings settings.
	 */
	import Icon from '@iconify/svelte';
	import Inspector from './Inspector.svelte';
	import AgentCard from './AgentCard.svelte';
	import MeetingPanel from './MeetingPanel.svelte';
	import CameraModal from './CameraModal.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import { PRESETS } from './presets';
	import { problemFresh } from '$lib/telemetry';
	import { AGENT_IDS, ORDER_DONE } from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';
	import type { DemoTrigger } from '$lib/demo';
	import type { LightMode } from '$lib/village/lighting';

	let { store }: { store: Bastion3DState } = $props();

	let dockOpen = $state(true);

	const LIGHTS: { mode: LightMode; label: string; icon: string }[] = [
		{ mode: 'golden', label: 'Golden hour', icon: 'mdi:weather-sunset' },
		{ mode: 'day', label: 'Day', icon: 'mdi:weather-sunny' },
		{ mode: 'night', label: 'Night', icon: 'mdi:weather-night' }
	];

	const TRIGGERS: { kind: DemoTrigger; label: string; icon: string }[] = [
		{ kind: 'containerDown', label: 'Container down', icon: 'mdi:server-off' },
		{ kind: 'motion', label: 'Motion', icon: 'mdi:motion-sensor' },
		{ kind: 'heatingOn', label: 'Heating on', icon: 'mdi:fire' },
		{ kind: 'voice', label: 'Voice command', icon: 'mdi:microphone' },
		{ kind: 'agents', label: 'Two agent turns', icon: 'mdi:robot' }
	];

	const SOURCE_ICON: Record<string, string> = {
		watch: 'mdi:shield-search',
		ai: 'mdi:brain',
		heat: 'mdi:fire',
		ha: 'mdi:home-assistant',
		cams: 'mdi:cctv',
		bastion: 'mdi:castle'
	};

	const time = (at: number) =>
		new Date(at).toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});

	const peersDown = $derived(
		Object.values(store.telemetry.peers).filter((state) => state === 'down').length
	);

	const awaiting = $derived(
		(store.telemetry.orders ?? []).filter((order) => order.status === 'awaiting_approval').length
	);
	const working = $derived(
		(store.telemetry.orders ?? []).filter((order) => !ORDER_DONE.includes(order.status)).length
	);

	async function logout() {
		await fetch('/_api/logout', { method: 'POST' });
		location.href = '/';
	}
</script>

<div class="hud">
	<header class="top glass">
		<a href="/" class="title" aria-label="Back to the overview">
			<Icon icon="mdi:castle" height="1.3rem" /> The Bastion
		</a>
		<span
			class="pill"
			class:ok={store.connection === 'open'}
			class:warn={store.connection === 'connecting'}
			class:bad={store.connection === 'closed'}
		>
			{store.mode === 'demo' ? 'demo' : store.connection}
		</span>
		{#if store.mode === 'live' && peersDown}<span class="pill bad">{peersDown} down</span>{/if}
		{#if store.telemetry.problems.length}
			{@const fresh = store.telemetry.problems.some((problem) => problemFresh(problem))}
			<span
				class="pill"
				class:bad={fresh}
				class:warn={!fresh}
				title={fresh ? 'New problems' : 'Standing problems'}
			>
				<Icon icon={fresh ? 'mdi:alert' : 'mdi:clock-alert-outline'} />
				{store.telemetry.problems.length}
			</span>
		{/if}
		{#if awaiting}
			<button
				class="pill warn plans"
				onclick={() => {
					store.select({ kind: 'agent', id: 'orchestrator' });
					store.goto('townhall');
				}}
			>
				<Icon icon="mdi:clipboard-check-outline" />
				{awaiting} plan{awaiting > 1 ? 's' : ''} to approve
			</button>
		{:else if working}
			<span class="pill">
				<Icon icon="mdi:hammer-wrench" />
				{working} change{working > 1 ? 's' : ''} in progress
			</span>
		{/if}
		<span class="spacer"></span>
		<button
			class="icon"
			onclick={() => (store.settingsOpen = true)}
			aria-label="Bindings"
			title="Bindings"
		>
			<Icon icon="mdi:cog" height="1.1rem" />
		</button>
		{#if store.configured}
			<button class="icon" onclick={logout} aria-label="Sign out" title="Sign out">
				<Icon icon="mdi:logout" height="1.1rem" />
			</button>
		{/if}
	</header>

	<aside class="dock glass" class:closed={!dockOpen}>
		<div class="dock-head">
			<button class="icon" onclick={() => (dockOpen = !dockOpen)} aria-label="Toggle the feed">
				<Icon icon={dockOpen ? 'mdi:chevron-left' : 'mdi:format-list-bulleted'} height="1.1rem" />
			</button>
			{#if dockOpen}
				<div class="seg">
					<button
						aria-pressed={store.mode === 'live'}
						disabled={!store.configured}
						onclick={() => store.setMode('live')}
					>
						Live
					</button>
					<button aria-pressed={store.mode === 'demo'} onclick={() => store.setMode('demo')}>
						Demo
					</button>
				</div>
			{/if}
		</div>
		{#if dockOpen}
			{#if !store.configured}
				<p class="dim small">Not configured (BASTION_SESSION_SECRET): demo only.</p>
			{/if}
			{#if store.mode === 'demo'}
				<div class="triggers">
					{#each TRIGGERS as trigger (trigger.kind)}
						<button onclick={() => store.trigger(trigger.kind)}>
							<Icon icon={trigger.icon} />
							{trigger.label}
						</button>
					{/each}
					<button onclick={() => (store.meeting.active ? store.endMeeting() : store.callMeeting())}>
						<Icon icon="mdi:account-group" />
						{store.meeting.active ? 'End meeting' : 'Call meeting'}
					</button>
				</div>
			{/if}
			<h4 class="dock-title">Agents</h4>
			<div class="agents">
				{#each AGENT_IDS as id (id)}
					<AgentCard {store} {id} />
				{/each}
			</div>
			<h4 class="dock-title">Events</h4>
			<div class="feed scroll">
				{#each store.events as event (event.id)}
					<div class="event {event.level}">
						<Icon icon={SOURCE_ICON[event.source] ?? 'mdi:information'} />
						<span class="text">{event.text}</span>
						<span class="dim mono">{time(event.at)}</span>
					</div>
				{:else}
					<p class="dim small">Nothing yet.</p>
				{/each}
			</div>
		{/if}
	</aside>

	<Inspector {store} />
	<MeetingPanel {store} />

	<footer class="bottom glass">
		<div class="presets scroll">
			{#each PRESETS as preset (preset.id)}
				<button aria-pressed={store.preset === preset.id} onclick={() => store.goto(preset.id)}>
					<Icon icon={preset.icon} /> <span>{preset.label}</span>
				</button>
			{/each}
		</div>
		<button
			class="meet"
			aria-pressed={store.meeting.active}
			onclick={() => (store.meeting.active ? store.endMeeting() : store.callMeeting())}
		>
			<Icon icon="mdi:account-group" />
			<span>{store.meeting.active ? 'End meeting' : 'Call meeting'}</span>
		</button>
		<div class="seg">
			{#each LIGHTS as option (option.mode)}
				<button
					aria-pressed={store.light === option.mode}
					onclick={() => store.setLight(option.mode)}
					aria-label={option.label}
					title={option.label}
				>
					<Icon icon={option.icon} />
				</button>
			{/each}
		</div>
	</footer>

	<CameraModal {store} />
	{#if store.settingsOpen}<SettingsPanel {store} />{/if}
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.hud > :global(*) {
		pointer-events: auto;
	}

	.top {
		position: absolute;
		top: 1rem;
		left: 1rem;
		right: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.7rem;
		border-radius: 1rem;
	}

	.title {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: white;
		text-decoration: none;
		font-weight: 500;
		letter-spacing: 0.02em;
		margin-right: 0.4rem;
	}

	.plans {
		cursor: pointer;
		border: 1px solid rgba(251, 191, 36, 0.5);
	}

	.spacer {
		flex: 1;
	}

	.dock {
		position: absolute;
		top: 4.2rem;
		left: 1rem;
		bottom: 5.4rem;
		width: min(20rem, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.8rem;
	}

	.dock.closed {
		bottom: auto;
		width: auto;
		padding: 0.4rem;
	}

	.dock-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.seg {
		display: inline-flex;
		gap: 0.2rem;
		padding: 0.15rem;
		border-radius: 0.8rem;
		background: rgba(0, 0, 0, 0.25);
	}

	.seg button {
		border-color: transparent;
	}

	.triggers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.triggers button {
		font-size: 0.75rem;
	}

	.dock-title {
		margin: 0.2rem 0 0;
		font-size: 0.68rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.55;
	}

	.agents {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
	}

	.meet {
		white-space: nowrap;
		font-size: 0.8rem;
		background: rgba(244, 114, 182, 0.18);
		border-color: rgba(244, 114, 182, 0.45);
	}

	.feed {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.event {
		display: grid;
		grid-template-columns: 1rem 1fr auto;
		gap: 0.4rem;
		align-items: start;
		font-size: 0.78rem;
		line-height: 1.3;
		padding: 0.2rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.event.alert {
		color: var(--bad);
	}

	.event.warn {
		color: var(--warn);
	}

	.event .mono {
		font-size: 0.66rem;
	}

	.small {
		font-size: 0.78rem;
		margin: 0;
	}

	.bottom {
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		border-radius: 1rem;
	}

	.presets {
		display: flex;
		gap: 0.3rem;
		flex: 1;
		overflow-x: auto;
	}

	.presets button {
		white-space: nowrap;
		font-size: 0.8rem;
	}

	@media (max-width: 700px) {
		.presets button span {
			display: none;
		}

		.dock {
			bottom: auto;
			max-height: 40vh;
		}
	}
</style>
