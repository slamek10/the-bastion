/**
 * The aggregate (src/lib/types.ts Telemetry), kept on the server from the
 * other apps' streams and Home Assistant. Listeners (the /_api/telemetry
 * streams) get each change as a diff; the event feed keeps the last 100
 * things that happened, for the HUD and the orchestrator's recent_events tool.
 */
import { randomUUID } from 'node:crypto';
import {
	camEvent,
	containerDown,
	containersFromWatch,
	diffTelemetry,
	emptyTelemetry,
	heatFromBrain,
	problemText,
	problemsFromWatch,
	pushEvent,
	voiceFrom,
	type CamsReview,
	type HaVoiceEvent,
	type HeatBrain,
	type WatchProblem,
	type WatchSnapshot
} from '$lib/telemetry';
import { followStream, peerFetch } from '$lib/server/peers';
import { onEntities, onHaState, startHa } from '$lib/server/ha';
import { appUrl, config } from '$lib/server/config';
import type {
	AgentId,
	AgentState,
	AppId,
	FeedEvent,
	FeedLevel,
	Telemetry,
	TelemetryMessage
} from '$lib/types';

type Listener = (message: TelemetryMessage) => void;

export class TelemetryHub {
	state: Telemetry;
	events: FeedEvent[] = [];
	private listeners = new Set<Listener>();

	constructor(now = Date.now()) {
		this.state = emptyTelemetry(now);
	}

	subscribe(listener: Listener) {
		this.listeners.add(listener);
		listener({ type: 'snapshot', telemetry: this.state, events: this.events });
		return () => {
			this.listeners.delete(listener);
		};
	}

	private broadcast(message: TelemetryMessage) {
		for (const listener of [...this.listeners]) {
			try {
				listener(message);
			} catch {
				this.listeners.delete(listener);
			}
		}
	}

	/** changes the state; listeners get only what changed */
	update(change: (state: Telemetry) => Telemetry, now = Date.now()) {
		const before = this.state;
		const after = { ...change(before), at: now };
		const diff = diffTelemetry(before, after);
		this.state = after;
		if (diff) this.broadcast(diff);
	}

	event(source: FeedEvent['source'], level: FeedLevel, text: string, now = Date.now()) {
		const event: FeedEvent = { id: randomUUID(), at: now, source, level, text };
		this.events = pushEvent(this.events, event);
		this.broadcast({ type: 'event', event });
		return event;
	}

	setPeer(peer: AppId | 'hass', state: Telemetry['peers'][AppId]) {
		if (this.state.peers[peer] === state) return;
		this.update((s) => ({ ...s, peers: { ...s.peers, [peer]: state } }));
	}

	setAgent(id: AgentId, patch: Partial<AgentState>) {
		this.update((s) => ({ ...s, agents: { ...s.agents, [id]: { ...s.agents[id], ...patch } } }));
	}

	/** Watch's snapshots and problems: container states, and feed lines for what changed */
	applyWatch(snapshots: WatchSnapshot[], problems: WatchProblem[]) {
		const before = this.state;
		const containers = containersFromWatch(snapshots, before.containers);
		const fleetProblems = problemsFromWatch(problems);
		const oldKeys = new Set(before.problems.map((problem) => problem.key));
		const newKeys = new Set(fleetProblems.map((problem) => problem.key));
		this.update((s) => ({ ...s, containers, problems: fleetProblems }));
		for (const problem of fleetProblems)
			if (!oldKeys.has(problem.key))
				this.event(
					'watch',
					problem.severity === 'critical' ? 'alert' : 'warn',
					problemText(problem)
				);
		for (const problem of before.problems)
			if (!newKeys.has(problem.key))
				this.event('watch', 'info', `Resolved: ${problemText(problem)}`);
		const oldState = new Map(before.containers.map((container) => [container.name, container]));
		for (const container of containers) {
			const old = oldState.get(container.name);
			if (old && containerDown(old) !== containerDown(container))
				this.event(
					'watch',
					containerDown(container) ? 'alert' : 'info',
					`${container.name} ${containerDown(container) ? `is ${container.state}` : 'is running again'}`
				);
		}
	}
}

const global = globalThis as unknown as { __bastionHub?: TelemetryHub; __bastionStarted?: boolean };
export const hub = (global.__bastionHub ??= new TelemetryHub());

/* ------------------------------------------------------------ sources */

interface WatchSystem {
	snapshots: WatchSnapshot[];
	problems: WatchProblem[];
}

function startWatch() {
	if (!appUrl('watch')) return;
	const load = () =>
		peerFetch<WatchSystem>('watch', '/_api/system')
			.then((system) => hub.applyWatch(system.snapshots ?? [], system.problems ?? []))
			.catch((error) => console.warn('[watch] system', error.message));
	followStream('watch', '/_api/stream', {
		onState: (state) => {
			hub.setPeer('watch', state);
			if (state === 'ok') load();
		},
		onMessage: (message) => {
			const m = message as { kind: string; snapshots?: WatchSnapshot[]; problems?: WatchProblem[] };
			if (m.kind === 'system') hub.applyWatch(m.snapshots ?? [], m.problems ?? []);
			else if (m.kind === 'notice') {
				const n = message as { title: string; message: string; alert?: boolean };
				hub.event('watch', n.alert ? 'alert' : 'info', `${n.title}: ${n.message}`);
			}
		}
	});
}

let heatAlerts = 0;
function startHeat() {
	if (!appUrl('heat')) return;
	followStream('heat', '/_api/stream', {
		onState: (state) => hub.setPeer('heat', state),
		onMessage: (message) => {
			const m = message as { kind: string; brain?: HeatBrain; alerts?: unknown[] };
			if (m.kind === 'alerts') {
				heatAlerts = m.alerts?.length ?? 0;
				hub.update((s) => ({ ...s, heat: { ...s.heat, alerts: heatAlerts } }));
			} else if (m.kind === 'brain' && m.brain) {
				const wasActive = hub.state.heat.active;
				const heat = heatFromBrain(m.brain, heatAlerts);
				hub.update((s) => ({ ...s, heat }));
				if (heat.active !== wasActive)
					hub.event(
						'heat',
						'info',
						heat.active
							? `Heating on: ${heat.rooms
									.filter((room) => room.calling)
									.map((room) => room.roomId)
									.join(', ')}`
							: 'Heating off'
					);
			}
		}
	});
}

function startCams() {
	if (!appUrl('cams')) return;
	followStream('cams', '/_api/stream', {
		onState: (state) => hub.setPeer('cams', state),
		onMessage: (message) => {
			const m = message as { kind: string; phase?: string; review?: CamsReview };
			if (m.kind !== 'review' || m.phase !== 'new' || !m.review) return;
			const event = camEvent(m.review);
			hub.update((s) => ({
				...s,
				cams: { lastMotion: event, recent: [event, ...s.cams.recent].slice(0, 20) }
			}));
			hub.event(
				'cams',
				event.severity === 'alert' ? 'warn' : 'info',
				`${event.label} at ${event.camera}${event.zones.length ? ` (${event.zones.join(', ')})` : ''}`
			);
		}
	});
}

function startVoice() {
	if (!appUrl('ha')) return;
	followStream('ha', '/_api/voice/events', {
		onState: (state) => hub.setPeer('ha', state),
		onMessage: (message) => {
			const event = message as HaVoiceEvent;
			if (!event || typeof event.kind !== 'string') return;
			hub.update((s) => ({ ...s, voice: voiceFrom(s.voice, event) }));
			if (event.kind === 'heard' && event.text.trim())
				hub.event('ha', 'info', `Heard: “${event.text}”`);
			else if (event.kind === 'answer')
				hub.event('ha', 'info', `Answered: ${event.text.slice(0, 140)}`);
		}
	});
}

/** bastion-ai answers /health: up or not, every minute */
function startAiHealth() {
	const base = appUrl('ai');
	if (!base) return;
	const check = async () => {
		try {
			const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
			hub.setPeer('ai', response.ok ? 'ok' : 'down');
		} catch {
			hub.setPeer('ai', 'down');
		}
	};
	check();
	setInterval(check, 60_000).unref?.();
}

function startEntities() {
	startHa();
	onHaState((state) => hub.setPeer('hass', state));
	// many sensors change every second: at most a few diffs a second
	let pending: Telemetry['ha'] | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	onEntities((entities) => {
		pending = entities;
		timer ??= setTimeout(() => {
			timer = undefined;
			const next = pending!;
			hub.update((s) => ({ ...s, ha: next }));
		}, 250);
	});
}

/** starts following everything once per process */
export function startTelemetry() {
	if (global.__bastionStarted) return;
	global.__bastionStarted = true;
	startWatch();
	startHeat();
	startCams();
	startVoice();
	startAiHealth();
	startEntities();
	if (!config.ai) {
		for (const id of Object.keys(hub.state.agents) as AgentId[])
			hub.setAgent(id, { available: false, reason: 'bastion-ai not configured' });
	}
	hub.event('bastion', 'info', 'The Bastion started');
}
