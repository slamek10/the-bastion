<script lang="ts">
	/**
	 * The glass panels over the scene: a top bar, the left dock (event feed,
	 * Live/Demo, the demo's simulation triggers), the inspector on the right,
	 * the presets and Twilight/Day at the bottom, the camera modal and the
	 * bindings settings.
	 */
	import Icon from '@iconify/svelte';
	import Inspector from './Inspector.svelte';
	import CameraModal from './CameraModal.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import { PRESETS } from './presets';
	import { problemFresh } from '$lib/telemetry';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';
	import type { DemoTrigger } from '$lib/demo';

	let { store }: { store: Bastion3DState } = $props();

	let dockOpen = $state(true);

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
				</div>
			{/if}
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

	<footer class="bottom glass">
		<div class="presets scroll">
			{#each PRESETS as preset (preset.id)}
				<button aria-pressed={store.preset === preset.id} onclick={() => store.goto(preset.id)}>
					<Icon icon={preset.icon} /> <span>{preset.label}</span>
				</button>
			{/each}
		</div>
		<div class="seg">
			<button
				aria-pressed={store.dayMode === 'twilight'}
				onclick={() => (store.dayMode = 'twilight')}
				aria-label="Twilight"
			>
				<Icon icon="mdi:weather-night" />
			</button>
			<button
				aria-pressed={store.dayMode === 'day'}
				onclick={() => (store.dayMode = 'day')}
				aria-label="Day"
			>
				<Icon icon="mdi:weather-sunny" />
			</button>
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
