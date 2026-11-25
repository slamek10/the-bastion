/**
 * Pure pieces of the telemetry aggregate, shared by the server (which builds
 * it) and the browser (which applies its diffs): the empty state, the
 * reducer, and how other apps' payloads become its parts.
 */
import {
	AGENT_IDS,
	type AgentId,
	type AgentState,
	type AppId,
	type CamEvent,
	type ContainerState,
	type FeedEvent,
	type FleetProblem,
	type HaEntity,
	type HeatState,
	type Telemetry,
	type TelemetryMessage,
	type TelemetryPart,
	type VoiceState
} from '$lib/types';

export const FEED_LIMIT = 100;

export function idleAgent(available = true, reason?: string): AgentState {
	return { state: 'idle', speaking: false, busy: false, available, ...(reason && { reason }) };
}

export function emptyTelemetry(now = Date.now()): Telemetry {
	return {
		at: now,
		peers: {
			watch: 'not configured',
			ai: 'not configured',
			heat: 'not configured',
			ha: 'not configured',
			cams: 'not configured',
			hass: 'not configured'
		},
		containers: [],
		problems: [],
		voice: { phase: 'idle', at: now },
		heat: { active: false, enabled: false, rooms: [], alerts: 0, at: now },
		cams: { recent: [] },
		ha: {},
		agents: Object.fromEntries(AGENT_IDS.map((id) => [id, idleAgent()])) as Record<
			AgentId,
			AgentState
		>
	};
}

/** applies one message; returns a new object (parts not touched are shared) */
export function applyMessage(state: Telemetry, message: TelemetryMessage): Telemetry {
	switch (message.type) {
		case 'snapshot':
			return message.telemetry;
		case 'diff': {
			const next: Telemetry = { ...state, ...(message.set ?? {}), at: message.at };
			if (message.ha) {
				const ha = { ...state.ha, ...message.ha.changed };
				for (const id of message.ha.removed) delete ha[id];
				next.ha = ha;
			}
			return next;
		}
		default:
			return state;
	}
}

/** the diff between two states: the parts that changed (by value) and the entities */
export function diffTelemetry(
	before: Telemetry,
	after: Telemetry
): Extract<TelemetryMessage, { type: 'diff' }> | undefined {
	const set: Partial<Pick<Telemetry, TelemetryPart>> = {};
	let any = false;
	for (const key of Object.keys(after) as (keyof Telemetry)[]) {
		if (key === 'ha' || key === 'at') continue;
		if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
			(set as Record<string, unknown>)[key] = after[key];
			any = true;
		}
	}
	const changed: Record<string, HaEntity> = {};
	const removed: string[] = [];
	for (const [id, entity] of Object.entries(after.ha)) {
		const old = before.ha[id];
		if (!old || old.state !== entity.state || old.last_changed !== entity.last_changed) {
			changed[id] = entity;
		} else if (
			old !== entity &&
			JSON.stringify(old.attributes) !== JSON.stringify(entity.attributes)
		)
			changed[id] = entity;
	}
	for (const id of Object.keys(before.ha)) if (!(id in after.ha)) removed.push(id);
	const ha = Object.keys(changed).length || removed.length ? { changed, removed } : undefined;
	if (!any && !ha) return undefined;
	return { type: 'diff', at: after.at, ...(any && { set }), ...(ha && { ha }) };
}

export function pushEvent(feed: FeedEvent[], event: FeedEvent, limit = FEED_LIMIT) {
	const next = [event, ...feed];
	if (next.length > limit) next.length = limit;
	return next;
}

/* ------------------------------------------------------------ Watch */

/** the fields of Watch's /_api/system that this app reads */
export interface WatchSnapshot {
	deviceId: string;
	at: number;
	ok: boolean;
	data?: {
		kind: string;
		containers?: {
			name: string;
			state: string;
			status?: string;
			health?: 'healthy' | 'unhealthy' | 'starting';
		}[];
	};
}

export interface WatchProblem {
	key: string;
	deviceId: string;
	severity: 'warning' | 'critical';
	message: string;
	vars?: Record<string, string>;
	since: number;
}

const APP_NAMES: [RegExp, AppId][] = [
	[/bastion-ha\b|bastion-ha-/, 'ha'],
	[/bastion-ai/, 'ai'],
	[/bastion-heat/, 'heat'],
	[/bastion-cams|frigate/, 'cams'],
	[/bastion-watch|clickhouse/, 'watch']
];

export function appOf(container: string): AppId | undefined {
	return APP_NAMES.find(([pattern]) => pattern.test(container))?.[1];
}

/**
 * Watch's Docker snapshots → container states. restarts carries over from
 * the last list and counts each time a container is seen go into restarting.
 */
export function containersFromWatch(
	snapshots: WatchSnapshot[],
	previous: ContainerState[] = [],
	now = Date.now()
): ContainerState[] {
	const before = new Map(previous.map((container) => [container.name, container]));
	const out: ContainerState[] = [];
	for (const snapshot of snapshots) {
		if (snapshot.data?.kind !== 'docker') continue;
		for (const container of snapshot.data.containers ?? []) {
			const old = before.get(container.name);
			const restarted = container.state === 'restarting' && old?.state !== 'restarting';
			const next: ContainerState = {
				name: container.name,
				state: container.state,
				...(container.health && { health: container.health }),
				...(container.status && { status: container.status }),
				restarts: (old?.restarts ?? 0) + (restarted ? 1 : 0),
				...(appOf(container.name) && { app: appOf(container.name) })
			};
			if (containerDown(next)) {
				// seen going down now, still down since then, or already down when first seen
				next.downSince = old ? (containerDown(old) ? (old.downSince ?? 0) : now) : 0;
			}
			out.push(next);
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function problemsFromWatch(problems: WatchProblem[]): FleetProblem[] {
	return problems.map((problem) => {
		const container = problem.key.includes('|container|')
			? problem.key.split('|container|')[1]
			: problem.vars?.name && problem.message.startsWith('prob_container')
				? problem.vars.name
				: undefined;
		return {
			key: problem.key,
			severity: problem.severity,
			message: problem.message,
			vars: problem.vars ?? {},
			since: problem.since,
			...(container && { container })
		};
	});
}

/** a container that isn't fine: not running, unhealthy, or restarting */
export function containerDown(container: ContainerState) {
	return container.state !== 'running' || container.health === 'unhealthy';
}

/** a problem or an outage older than this is shown as standing, not as an alarm */
export const STALE_AFTER = 30 * 60_000;

export const problemFresh = (problem: FleetProblem, now = Date.now()) =>
	now - problem.since < STALE_AFTER;

/**
 * The Watchdog's alarm: a container problem that's fresh, or a container
 * seen going down in the last half hour (docker stop exits 0, which Watch
 * doesn't call a problem). Outages that stand longer are shown, not alarmed.
 */
export function containerAlarm(t: Pick<Telemetry, 'containers' | 'problems'>, now = Date.now()) {
	if (t.problems.some((problem) => problem.container && problemFresh(problem, now))) return true;
	return t.containers.some(
		(container) =>
			containerDown(container) && !!container.downSince && now - container.downSince < STALE_AFTER
	);
}

/** any Watch problem or container outage that's fresh: the bunker's red strobe */
export function freshAlarm(t: Pick<Telemetry, 'containers' | 'problems'>, now = Date.now()) {
	return t.problems.some((problem) => problemFresh(problem, now)) || containerAlarm(t, now);
}

/** why the racks have nothing to show, or undefined when they do */
export function noContainersReason(t: Pick<Telemetry, 'containers' | 'peers'>) {
	if (t.containers.length) return undefined;
	if (t.peers.watch === 'ok') return 'no Docker device in Watch';
	return `Watch ${t.peers.watch}`;
}

/** words for a Watch problem, without Watch's translations */
export function problemText(problem: FleetProblem) {
	const name = problem.vars.name ?? problem.container ?? '';
	const words: Record<string, string> = {
		prob_container_exited: `${name} exited (${problem.vars.code ?? '?'})`,
		prob_container_restarting: `${name} keeps restarting`,
		prob_container_unhealthy: `${name} is unhealthy`
	};
	return (
		words[problem.message] ??
		`${problem.message.replace(/^prob_/, '').replace(/_/g, ' ')}${name ? `: ${name}` : ''}`
	);
}

/* ------------------------------------------------------------ Heat */

export interface HeatBrain {
	enabled: boolean;
	plans: { roomId: string; target?: number; calling: boolean }[];
}

export function heatFromBrain(brain: HeatBrain, alerts: number, now = Date.now()): HeatState {
	const rooms = (brain.plans ?? []).map((plan) => ({
		roomId: plan.roomId,
		...(typeof plan.target === 'number' && { target: plan.target }),
		calling: !!plan.calling
	}));
	return {
		active: rooms.some((room) => room.calling),
		enabled: !!brain.enabled,
		rooms,
		alerts,
		at: now
	};
}

/* ------------------------------------------------------------ Cams */

export interface CamsReview {
	id: string;
	camera: string;
	start_time: number;
	severity: 'alert' | 'detection';
	data?: { objects?: string[]; zones?: string[] };
}

export function camEvent(review: CamsReview): CamEvent {
	return {
		id: review.id,
		camera: review.camera,
		label: review.data?.objects?.[0] ?? 'motion',
		severity: review.severity === 'alert' ? 'alert' : 'detection',
		zones: review.data?.zones ?? [],
		// Frigate's times are seconds
		at: review.start_time < 1e12 ? Math.round(review.start_time * 1000) : review.start_time
	};
}

/* ------------------------------------------------------------ voice */

export type HaVoiceEvent =
	| { kind: 'heard'; text: string; at: number }
	| { kind: 'routed'; to: 'ha' | 'claude'; at: number }
	| { kind: 'answer'; text: string; at: number }
	| { kind: 'speaking'; at: number }
	| { kind: 'idle'; at: number }
	| { kind: 'wake'; at: number };

export function voiceFrom(previous: VoiceState, event: HaVoiceEvent): VoiceState {
	switch (event.kind) {
		case 'wake':
			return { phase: 'wake', at: event.at };
		case 'heard':
			// nothing heard: back to quiet
			return event.text.trim()
				? { phase: 'heard', heard: event.text, at: event.at }
				: { phase: 'idle', at: event.at };
		case 'routed':
			return { ...previous, phase: 'routed', routed: event.to, at: event.at };
		case 'answer':
			return { ...previous, phase: 'answer', answer: event.text, at: event.at };
		case 'speaking':
			return { ...previous, phase: 'speaking', at: event.at };
		case 'idle':
			return { ...previous, phase: 'idle', at: event.at };
		default:
			return previous;
	}
}

/** the voice assistant is busy: heard something and hasn't finished answering */
export const voiceActive = (voice: VoiceState) => voice.phase !== 'idle';
