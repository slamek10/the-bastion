<script lang="ts">
	/**
	 * The overview: a flat summary of the fleet from /_api/telemetry, and the
	 * way into the 3D view. Leaving /3d for here unmounts the whole scene.
	 */
	import Icon from '@iconify/svelte';
	import {
		applyMessage,
		containerDown,
		emptyTelemetry,
		noContainersReason,
		problemFresh,
		problemText
	} from '$lib/telemetry';
	import type { Telemetry } from '$lib/types';

	let { data } = $props();
	let t: Telemetry = $state.raw(emptyTelemetry());

	$effect(() => {
		if (!data.configured) return;
		const source = new EventSource('/_api/telemetry');
		source.onmessage = (event) => {
			try {
				t = applyMessage(t, JSON.parse(event.data));
			} catch {
				// a broken line
			}
		};
		return () => source.close();
	});

	const down = $derived(t.containers.filter(containerDown));
</script>

<main>
	<header class="glass">
		<Icon icon="mdi:castle" height="1.6rem" />
		<h1>The Bastion</h1>
		<span class="spacer"></span>
		<a class="enter" href={data.configured ? '/3d' : '/3d?demo'}>
			<Icon icon="mdi:cube-outline" /> Enter 3D
		</a>
	</header>

	{#if !data.configured}
		<p class="glass warn">
			Not configured: set {data.missing.join(', ')} in .env. The 3D view runs in demo mode.
		</p>
	{:else}
		<section class="grid">
			<div class="glass">
				<h3>Apps</h3>
				{#each Object.entries(t.peers) as [peer, state] (peer)}
					<div class="row">
						<span>{peer}</span><span
							class="pill"
							class:ok={state === 'ok'}
							class:bad={state === 'down'}
						>
							{state}
						</span>
					</div>
				{/each}
			</div>
			<div class="glass">
				<h3>
					Containers <span class="dim">
						{t.containers.length - down.length}/{t.containers.length}
					</span>
				</h3>
				{#each down as container (container.name)}
					<div class="row">
						<span class="mono">{container.name}</span><span class="pill bad">
							{container.state}
						</span>
					</div>
				{:else}
					<p class="dim">{noContainersReason(t) ?? 'All running.'}</p>
				{/each}
				{#each t.problems as problem (problem.key)}
					<p class="problem" class:standing={!problemFresh(problem)}>
						{problemText(problem)}{problemFresh(problem) ? '' : ' (standing)'}
					</p>
				{/each}
			</div>
			<div class="glass">
				<h3>House</h3>
				<div class="row"><span>Heating</span><span>{t.heat.active ? 'on' : 'off'}</span></div>
				<div class="row">
					<span>Last motion</span><span>
						{t.cams.lastMotion ? `${t.cams.lastMotion.label} · ${t.cams.lastMotion.camera}` : '–'}
					</span>
				</div>
				<div class="row"><span>Voice</span><span>{t.voice.phase}</span></div>
				<div class="row"><span>Entities</span><span>{Object.keys(t.ha).length}</span></div>
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	h1 {
		margin: 0;
		font-weight: 400;
		font-size: 1.3rem;
	}

	h3 {
		margin: 0 0 0.6rem;
		font-weight: 500;
		font-size: 1rem;
	}

	.spacer {
		flex: 1;
	}

	.enter {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.9rem;
		border-radius: 0.8rem;
		background: rgba(125, 211, 252, 0.2);
		border: 1px solid rgba(125, 211, 252, 0.5);
		color: white;
		text-decoration: none;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem;
	}

	.row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.88rem;
		padding: 0.2rem 0;
	}

	.warn,
	.problem {
		color: var(--warn);
		margin: 0;
	}

	.problem.standing {
		color: var(--dim);
	}
</style>
