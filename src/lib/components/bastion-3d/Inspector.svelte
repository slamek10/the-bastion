<script lang="ts">
	/**
	 * The right drawer for the selected robot or room: live metrics, its app's
	 * recent events and problems, quick Home Assistant toggles for the room's
	 * bound entities, a chat with the room's robot, and for the watchtower a
	 * live camera preview.
	 */
	import Icon from '@iconify/svelte';
	import HlsPreview from './HlsPreview.svelte';
	import OrderCard from './OrderCard.svelte';
	import { AGENT_TARGET, TARGET_AGENT } from '$lib/orders';
	import { AGENT_NAMES, AGENT_ROOM, agentMode, MODE_COLOR } from './agents/agent';
	import { ROOM_LABELS } from '$lib/bindings';
	import { containerDown, noContainersReason, problemFresh, problemText } from '$lib/telemetry';
	import {
		AGENT_IDS,
		ORDER_REPO,
		ORDER_TARGETS,
		type AgentId,
		type AppId,
		type HaEntity,
		type OrderTarget,
		type RoomId
	} from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let { store }: { store: Bastion3DState } = $props();

	const ROOM_APP: Record<RoomId, AppId> = {
		forge: 'watch',
		townhall: 'ai',
		boiler: 'heat',
		cottage: 'ha',
		tower: 'cams',
		pond: 'cams'
	};
	const ROOM_AGENT = Object.fromEntries(AGENT_IDS.map((id) => [AGENT_ROOM[id], id])) as Partial<
		Record<RoomId, AgentId>
	>;
	ROOM_AGENT.pond = 'vision';

	const room: RoomId | undefined = $derived(
		store.selection?.kind === 'room'
			? store.selection.id
			: store.selection?.kind === 'agent'
				? AGENT_ROOM[store.selection.id]
				: undefined
	);
	const agentId: AgentId | undefined = $derived(
		store.selection?.kind === 'agent' ? store.selection.id : room ? ROOM_AGENT[room] : undefined
	);
	const app = $derived(room ? ROOM_APP[room] : undefined);
	const t = $derived(store.telemetry);
	const agent = $derived(agentId ? t.agents[agentId] : undefined);
	const mode = $derived(agentId ? agentMode(agentId, t, Date.now(), store.meeting.active) : 'IDLE');
	const chat = $derived(agentId ? store.chats[agentId] : undefined);
	const feed = $derived(store.events.filter((event) => event.source === app).slice(0, 12));
	const entities = $derived(
		room
			? store.bindings[room].map(
					(id) => t.ha[id] ?? ({ entity_id: id, state: 'unavailable', attributes: {} } as HaEntity)
				)
			: []
	);
	const firstCamera = $derived(store.bindings.tower.find((id) => id.startsWith('camera.')) ?? '');

	let message = $state('');

	// a change request: the robot's own app is picked to start with
	let change = $state('');
	let targets: OrderTarget[] = $state([]);
	let filing = $state(false);
	let fileError = $state('');
	$effect(() => {
		const id = agentId;
		targets = id && AGENT_TARGET[id] ? [AGENT_TARGET[id]!] : [];
	});
	const orders = $derived(
		(store.telemetry.orders ?? []).filter(
			(order) =>
				agentId === 'orchestrator' ||
				order.from === agentId ||
				[...order.apps, ...order.targets].some((app) => TARGET_AGENT[app] === agentId)
		)
	);

	async function fileChange(event: SubmitEvent) {
		event.preventDefault();
		if (!agentId || !change.trim()) return;
		filing = true;
		fileError = '';
		const result = await store.fileOrder(agentId, targets, change.trim());
		filing = false;
		if (result.ok) change = '';
		else fileError = result.error ?? 'failed';
	}
	let busy: Record<string, boolean> = $state({});
	let serviceError = $state('');
	let chatBox: HTMLDivElement | undefined = $state();

	$effect(() => {
		void chat?.lines.length;
		void chat?.lines[chat.lines.length - 1]?.text;
		if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
	});

	const name = (entity: HaEntity) => String(entity.attributes.friendly_name ?? entity.entity_id);
	const domain = (entity: HaEntity) => entity.entity_id.split('.')[0];

	async function call(entity: HaEntity, service: string, data?: Record<string, unknown>) {
		busy[entity.entity_id] = true;
		serviceError = '';
		const result = await store.callService(domain(entity), service, entity.entity_id, data);
		if (!result.ok) serviceError = result.error ?? 'failed';
		busy[entity.entity_id] = false;
	}

	function send(event: SubmitEvent) {
		event.preventDefault();
		if (!agentId || !message.trim()) return;
		store.send(agentId, message.trim());
		message = '';
	}

	const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
	const ago = (at: number) => {
		const s = Math.round((Date.now() - at) / 1000);
		return s < 60
			? `${s}s`
			: s < 3600
				? `${Math.round(s / 60)}m`
				: s < 172_800
					? `${Math.round(s / 3600)}h`
					: `${Math.round(s / 86_400)}d`;
	};
</script>

{#if room}
	<aside class="inspector glass">
		<header>
			<div>
				<h2>
					{agentId && store.selection?.kind === 'agent' ? AGENT_NAMES[agentId] : ROOM_LABELS[room]}
				</h2>
				<div class="sub">
					<span class="pill" style="color: {hex(MODE_COLOR[mode])}">
						{agent?.state === 'waiting' ? 'WAITING' : mode}
					</span>
					{#if app}
						<span class="pill" class:ok={t.peers[app] === 'ok'} class:bad={t.peers[app] === 'down'}>
							bastion-{app} · {t.peers[app]}
						</span>
					{/if}
				</div>
			</div>
			<button class="icon" onclick={() => store.select(null)} aria-label="Close">
				<Icon icon="mdi:close" height="1.1rem" />
			</button>
		</header>

		<div class="body scroll">
			<!-- metrics -->
			<section>
				<h4>Live</h4>
				{#if room === 'forge'}
					<div class="grid">
						{#each t.containers as container (container.name)}
							<div class="row" class:down={containerDown(container)}>
								<span class="led"></span>
								<span class="mono">{container.name}</span>
								<span class="dim">
									{container.health ?? container.state}{container.restarts
										? ` · ↻${container.restarts}`
										: ''}
								</span>
							</div>
						{:else}
							<p class="warn-text">{noContainersReason(t)}</p>
						{/each}
					</div>
					{#each [...t.problems].sort((a, b) => b.since - a.since) as problem (problem.key)}
						{@const fresh = problemFresh(problem)}
						<p
							class="problem"
							class:critical={fresh && problem.severity === 'critical'}
							class:standing={!fresh}
						>
							<Icon icon={fresh ? 'mdi:alert' : 'mdi:clock-alert-outline'} />
							{problemText(problem)}
							{#if !fresh}<span class="pill">standing · {ago(problem.since)}</span>{/if}
						</p>
					{/each}
				{:else if room === 'townhall'}
					{#each AGENT_IDS as id (id)}
						<div class="row">
							<span
								class="led"
								style="background: {hex(
									MODE_COLOR[agentMode(id, t, Date.now(), store.meeting.active)]
								)}"
							></span>
							<span>{AGENT_NAMES[id]}</span>
							<span class="dim">
								{t.agents[id].state}{t.agents[id].available
									? ''
									: ` · ${t.agents[id].reason ?? 'unavailable'}`}
							</span>
						</div>
					{/each}
					<p class="dim">Voice: {t.voice.phase}{t.voice.heard ? ` · “${t.voice.heard}”` : ''}</p>
					{#if store.meeting.active}
						<button class="wide" onclick={() => store.endMeeting()}>
							<Icon icon="mdi:account-group" /> End meeting
						</button>
					{:else}
						<button class="wide" onclick={() => store.callMeeting()}>
							<Icon icon="mdi:account-group" /> Call meeting
						</button>
					{/if}
				{:else if room === 'boiler'}
					<p>
						Heating <b>{t.heat.active ? 'on' : 'off'}</b>{t.heat.enabled ? '' : ' (brain off)'}{t
							.heat.alerts
							? ` · ${t.heat.alerts} alerts`
							: ''}
					</p>
					{#each t.heat.rooms as heatRoom (heatRoom.roomId)}
						<div class="row">
							<span class="led" style="background: {heatRoom.calling ? '#f97316' : '#3b82f6'}"
							></span>
							<span>{heatRoom.roomId}</span>
							<span class="dim">
								{heatRoom.target !== undefined ? `${heatRoom.target}°` : ''}
								{heatRoom.calling ? 'calling' : ''}
							</span>
						</div>
					{/each}
				{:else if room === 'cottage'}
					<p>
						{Object.values(t.ha).filter((e) => e.entity_id.startsWith('light.') && e.state === 'on')
							.length} lights on ·
						{Object.keys(t.ha).length} entities · HA {t.peers.hass}
					</p>
				{:else}
					{#if firstCamera}
						{#key firstCamera + store.mode}
							<HlsPreview {store} entityId={firstCamera} />
						{/key}
						<button class="wide" onclick={() => (store.cameraModal = firstCamera)}>
							<Icon icon="mdi:fullscreen" /> Open cameras
						</button>
					{/if}
					{#each t.cams.recent.slice(0, 6) as event (event.id)}
						<div class="row">
							<span
								class="led"
								style="background: {event.severity === 'alert' ? '#f87171' : '#fbbf24'}"
							></span>
							<span>{event.label} · {event.camera}</span>
							<span class="dim">{ago(event.at)}</span>
						</div>
					{:else}
						<p class="dim">No motion since start.</p>
					{/each}
				{/if}
			</section>

			<!-- quick toggles -->
			{#if entities.length}
				<section>
					<h4>Home Assistant</h4>
					{#each entities as entity (entity.entity_id)}
						{@const d = domain(entity)}
						<div class="entity">
							<span class="ename" title={entity.entity_id}>{name(entity)}</span>
							<span class="dim small">
								{entity.state}{typeof entity.attributes.current_position === 'number'
									? ` ${entity.attributes.current_position}%`
									: ''}{typeof entity.attributes.current_temperature === 'number'
									? ` ${entity.attributes.current_temperature}°`
									: ''}
							</span>
							<span class="actions">
								{#if d === 'light' || d === 'switch'}
									<button
										aria-pressed={entity.state === 'on'}
										disabled={busy[entity.entity_id]}
										onclick={() => call(entity, 'toggle')}
									>
										<Icon
											icon={entity.state === 'on'
												? 'mdi:toggle-switch'
												: 'mdi:toggle-switch-off-outline'}
										/>
									</button>
								{:else if d === 'cover'}
									<button
										disabled={busy[entity.entity_id]}
										onclick={() => call(entity, 'open_cover')}
										aria-label="Open"
									>
										<Icon icon="mdi:arrow-up" />
									</button>
									<button
										disabled={busy[entity.entity_id]}
										onclick={() => call(entity, 'stop_cover')}
										aria-label="Stop"
									>
										<Icon icon="mdi:stop" />
									</button>
									<button
										disabled={busy[entity.entity_id]}
										onclick={() => call(entity, 'close_cover')}
										aria-label="Close"
									>
										<Icon icon="mdi:arrow-down" />
									</button>
								{:else if d === 'climate' && typeof entity.attributes.temperature === 'number'}
									{@const target = entity.attributes.temperature as number}
									<button
										disabled={busy[entity.entity_id]}
										onclick={() => call(entity, 'set_temperature', { temperature: target - 0.5 })}
									>
										<Icon icon="mdi:minus" />
									</button>
									<span class="mono">{target}°</span>
									<button
										disabled={busy[entity.entity_id]}
										onclick={() => call(entity, 'set_temperature', { temperature: target + 0.5 })}
									>
										<Icon icon="mdi:plus" />
									</button>
								{:else if d === 'scene' || d === 'script'}
									<button disabled={busy[entity.entity_id]} onclick={() => call(entity, 'turn_on')}>
										<Icon icon="mdi:play" />
									</button>
								{/if}
							</span>
						</div>
					{/each}
					{#if serviceError}<p class="problem">{serviceError}</p>{/if}
				</section>
			{/if}

			<!-- recent from this app -->
			{#if feed.length}
				<section>
					<h4>Recent</h4>
					{#each feed as event (event.id)}
						<div class="feed {event.level}">
							<span class="dim">{ago(event.at)}</span>
							{event.text}
						</div>
					{/each}
				</section>
			{/if}

			<!-- chat -->
			{#if agentId && chat}
				<section class="chat">
					<h4>
						Talk to {AGENT_NAMES[agentId]}
						{#if agent && !agent.available}<span class="pill warn">
								{agent.reason ?? 'not available'}
							</span>{/if}
					</h4>
					{#if agent?.lastAnswer && !chat.lines.length}
						<p class="dim small">Last: {agent.lastAnswer.slice(0, 220)}</p>
					{/if}
					<div class="lines scroll" bind:this={chatBox}>
						{#each chat.lines as line, i (i)}
							<div class="line {line.role}">
								{#if line.role === 'tool'}<Icon icon="mdi:tools" />
									{line.text}{:else}{line.text}{/if}
							</div>
						{/each}
						{#if chat.status === 'waiting'}
							<div class="line tool">
								<Icon icon="mdi:timer-sand" /> waiting{chat.position ? ` (#${chat.position})` : ''}…
							</div>
						{/if}
					</div>
					<form onsubmit={send}>
						<input
							bind:value={message}
							placeholder="Ask {AGENT_NAMES[agentId]}…"
							disabled={chat.status !== 'idle'}
						/>
						<button disabled={chat.status !== 'idle' || !message.trim()} aria-label="Send">
							<Icon icon="mdi:send" />
						</button>
					</form>
				</section>

				<!-- code changes: filed here, planned and shipped by the orchestrator session on the Mac -->
				<section class="changes">
					<h4>Change the code</h4>
					<form class="change" onsubmit={fileChange}>
						<textarea
							bind:value={change}
							rows="3"
							placeholder={AGENT_TARGET[agentId]
								? `What should change in ${ORDER_REPO[AGENT_TARGET[agentId]!]}?`
								: 'What should change, and in which app?'}></textarea>
						<div class="targets">
							{#each ORDER_TARGETS as target (target)}
								<button
									type="button"
									aria-pressed={targets.includes(target)}
									onclick={() =>
										(targets = targets.includes(target)
											? targets.filter((t) => t !== target)
											: [...targets, target])}
								>
									{ORDER_REPO[target]}
								</button>
							{/each}
						</div>
						<div class="file-row">
							<span class="dim small">
								The orchestrator plans it; nothing is coded until you approve.
							</span>
							<button disabled={filing || !change.trim()}>
								<Icon icon="mdi:file-send" /> File
							</button>
						</div>
						{#if fileError}<p class="problem">{fileError}</p>{/if}
					</form>
					{#each orders as order (order.id)}
						<OrderCard {store} {order} />
					{/each}
				</section>
			{/if}
		</div>
	</aside>
{/if}

<style>
	.inspector {
		position: absolute;
		top: 4.2rem;
		right: 1rem;
		bottom: 5.4rem;
		width: min(24rem, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
		padding: 0.9rem;
		z-index: 10;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	h2 {
		margin: 0 0 0.35rem;
		font-size: 1.1rem;
		font-weight: 500;
	}

	.sub {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.body {
		flex: 1;
		margin-top: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	h4 {
		margin: 0 0 0.45rem;
		font-size: 0.72rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.6;
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	section p {
		margin: 0.35rem 0;
		font-size: 0.85rem;
	}

	.row {
		display: grid;
		grid-template-columns: 0.6rem 1fr auto;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		padding: 0.18rem 0;
	}

	.led {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--ok);
	}

	.row.down .led {
		background: var(--bad);
		box-shadow: 0 0 8px var(--bad);
	}

	.problem {
		color: var(--warn);
		display: flex;
		gap: 0.3rem;
		align-items: center;
	}

	.problem.critical {
		color: var(--bad);
	}

	.problem.standing {
		color: var(--dim);
	}

	.warn-text {
		color: var(--warn);
	}

	.entity {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'name actions' 'state actions';
		gap: 0 0.5rem;
		padding: 0.3rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.ename {
		grid-area: name;
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.small {
		font-size: 0.72rem;
	}

	.entity .small {
		grid-area: state;
	}

	.actions {
		grid-area: actions;
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.wide {
		width: 100%;
		justify-content: center;
		margin: 0.4rem 0;
	}

	.feed {
		font-size: 0.78rem;
		padding: 0.12rem 0;
	}

	.feed.alert {
		color: var(--bad);
	}

	.feed.warn {
		color: var(--warn);
	}

	.changes {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.change {
		flex-direction: column;
	}

	.change textarea {
		resize: vertical;
		font-size: 0.84rem;
	}

	.targets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.targets button {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
	}

	.file-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.chat .lines {
		max-height: 16rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.line {
		font-size: 0.84rem;
		line-height: 1.4;
		padding: 0.4rem 0.6rem;
		border-radius: 0.8rem;
		white-space: pre-wrap;
	}

	.line.user {
		align-self: flex-end;
		background: rgba(125, 211, 252, 0.18);
	}

	.line.agent {
		background: rgba(255, 255, 255, 0.07);
	}

	.line.tool {
		font-size: 0.72rem;
		opacity: 0.65;
		padding: 0 0.4rem;
		display: flex;
		gap: 0.3rem;
		align-items: center;
	}

	.line.error {
		color: var(--bad);
		font-size: 0.78rem;
	}

	form {
		display: flex;
		gap: 0.4rem;
	}

	form input {
		flex: 1;
		min-width: 0;
	}
</style>
