/**
 * The five villagers' behaviour. Their state comes from telemetry (and the
 * meeting, which is client state):
 *   ALERT     Watchdog on a fresh container problem, Vision Sentinel on fresh
 *             motion: runs to its building
 *   MEETING   the Orchestrator called a meeting: walks to the town hall and sits
 *             in its chair (an ALERT gets up, runs off, and comes back)
 *   SPEAKING  its turn's answer streams; the Orchestrator also while HA's voice speaks
 *   COLLAB    a work order's brief goes out, or two turns run at once: meet on the plaza
 *   WORKING   its turn runs (or waits) or its app is being coded: at its building
 *   IDLE      strolls: a bench, the fountain, the dock, a garden plot, lingers, waves
 * They walk the village's paths (A* over the walking graph), never through
 * a building or the pond.
 */
import {
	CapsuleGeometry,
	Color,
	Group,
	Mesh,
	MeshStandardMaterial,
	Vector3,
	type WebGLRenderer
} from 'three';
import { Disposer } from '../disposer';
import { setPick, type FrameContext } from '../scene/common';
import { recentMotion } from '../scene/visionTower';
import {
	createCharacter,
	LOOKS,
	renderPortrait,
	type Character,
	type CharacterAssets
} from './characters';
import { containerAlarm } from '$lib/telemetry';
import { TARGET_AGENT } from '$lib/orders';
import { animationFor, SPEED, type AgentMode, type Clip } from '$lib/village/animation';
import { AGENT_BUILDING, BUILDINGS, NODES, START, TABLE } from '$lib/village/layout';
import { chairOf } from '$lib/village/meeting';
import { findPath, lingerSeconds, nearestNode, pickWanderSpot } from '$lib/village/navigation';
import { AGENT_IDS, type AgentId, type RoomId, type Telemetry } from '$lib/types';

export type { AgentMode };

export const AGENT_NAMES: Record<AgentId, string> = {
	watchdog: 'Watchdog',
	orchestrator: 'Orchestrator',
	thermal: 'Thermal Sentinel',
	homekeeper: 'Home Keeper',
	vision: 'Vision Sentinel'
};

/** the building each agent lives in (its inspector, its camera preset) */
export const AGENT_ROOM: Record<AgentId, RoomId> = AGENT_BUILDING;

export const MODE_COLOR: Record<AgentMode, number> = {
	IDLE: 0x38bdf8,
	WORKING: 0xfbbf24,
	COLLAB: 0xa78bfa,
	ALERT: 0xef4444,
	SPEAKING: 0x4ade80,
	MEETING: 0xf472b6
};

export const ACCENT: Record<AgentId, number> = Object.fromEntries(
	AGENT_IDS.map((id) => [id, LOOKS[id].accent])
) as Record<AgentId, number>;

const VOICE_TALKING = new Set(['heard', 'routed', 'answer', 'speaking']);

/** what an agent does now, from telemetry and whether a meeting is on */
export function agentMode(id: AgentId, t: Telemetry, now = Date.now(), meeting = false): AgentMode {
	const agent = t.agents[id];
	// a fresh container problem or outage; standing ones are shown at the forge, not alarmed
	if (id === 'watchdog' && containerAlarm(t, now)) return 'ALERT';
	if (id === 'vision' && recentMotion(t.cams.lastMotion, now)) return 'ALERT';
	if (meeting) return 'MEETING';
	if (agent?.speaking) return 'SPEAKING';
	if (id === 'orchestrator' && VOICE_TALKING.has(t.voice.phase)) return 'SPEAKING';
	// a work order: the brief goes from the Orchestrator to the app's agent
	if (orderPartner(id, t)) return 'COLLAB';
	const others = AGENT_IDS.filter((other) => other !== id && t.agents[other]?.busy);
	if (agent?.busy && others.length) return 'COLLAB';
	if (agent?.busy || agent?.state === 'waiting' || orderWork(id, t)) return 'WORKING';
	return 'IDLE';
}

const ORCHESTRATOR_BUSY = new Set(['new', 'planning', 'approved', 'ready', 'shipping']);
const APP_BUSY = new Set(['coding', 'ready']);

/** an order keeps this agent busy: the Orchestrator plans and ships, an app's agent codes */
function orderWork(id: AgentId, t: Telemetry) {
	return (t.orders ?? []).some((order) =>
		id === 'orchestrator'
			? ORCHESTRATOR_BUSY.has(order.status)
			: APP_BUSY.has(order.status) && order.apps.some((app) => TARGET_AGENT[app] === id)
	);
}

/** while an approved order's brief is handed over: the other agent of that order */
function orderPartner(id: AgentId, t: Telemetry): AgentId | undefined {
	for (const order of t.orders ?? []) {
		if (order.status !== 'approved') continue;
		const agents: AgentId[] = order.apps
			.map((app) => TARGET_AGENT[app])
			.filter((agent) => agent !== 'orchestrator');
		if (id === 'orchestrator' && agents.length) return agents[0];
		if (agents.includes(id)) return 'orchestrator';
	}
	return undefined;
}

/** who an agent meets in COLLAB: its order's partner, or another agent whose turn runs */
export function collabPartner(id: AgentId, t: Telemetry): AgentId | undefined {
	return orderPartner(id, t) ?? AGENT_IDS.find((other) => other !== id && t.agents[other]?.busy);
}

/** where an agent heads in each state; IDLE is decided by its stroll */
export function goalFor(id: AgentId, mode: AgentMode, t: Telemetry): string | undefined {
	const building = BUILDINGS[AGENT_BUILDING[id]];
	switch (mode) {
		case 'ALERT':
			return building.door;
		case 'MEETING':
			return chairOf(id).id;
		case 'WORKING':
			return building.work;
		case 'COLLAB': {
			const partner = collabPartner(id, t);
			if (!partner) return building.work;
			return AGENT_IDS.indexOf(id) < AGENT_IDS.indexOf(partner) ? 'meet_a' : 'meet_b';
		}
		default:
			return undefined;
	}
}

/* ------------------------------------------------------------ one agent */

export class AgentActor {
	readonly id: AgentId;
	readonly root = new Group();
	mode: AgentMode = 'IDLE';
	clip: Clip = 'idle';
	/** world position of the nameplate */
	readonly anchor = new Vector3();
	character: Character | undefined;
	moving: 'still' | 'walk' | 'run' = 'still';
	private placeholder: Mesh;
	private path: string[] = [];
	private goal: string | undefined;
	private wanderGoal: string | undefined;
	private linger = 0;
	private waving = 0;
	private waveCooldown = 5;
	private seated = false;

	constructor(
		id: AgentId,
		d: Disposer,
		private random: () => number = Math.random
	) {
		this.id = id;
		this.root.name = id;
		const start = NODES.get(START[id])!;
		this.root.position.set(start.x, 0, start.z);
		// until the model loads: a capsule in the agent's colour
		const material = d.track(
			new MeshStandardMaterial({ color: new Color(LOOKS[id].accent), roughness: 0.6 })
		);
		this.placeholder = new Mesh(d.track(new CapsuleGeometry(0.28, 1.1, 4, 12)), material);
		this.placeholder.position.y = 0.85;
		this.placeholder.castShadow = true;
		this.root.add(this.placeholder);
		this.linger = random() * 4;
		setPick(this.root, { kind: 'agent', id });
	}

	setCharacter(character: Character) {
		this.character = character;
		this.root.remove(this.placeholder);
		this.root.add(character.root);
		setPick(this.root, { kind: 'agent', id: this.id });
		character.actions[this.clip]?.play();
	}

	private here() {
		return nearestNode(this.root.position.x, this.root.position.z);
	}

	private head(to: string | undefined) {
		if (to === this.goal) return;
		this.goal = to;
		this.path = to ? (findPath(this.here(), to) ?? []) : [];
	}

	private play(clip: Clip) {
		if (clip === this.clip) return;
		const from = this.character?.actions[this.clip];
		const to = this.character?.actions[clip];
		this.clip = clip;
		if (!to) return;
		to.reset().setEffectiveWeight(1).play();
		if (from) to.crossFadeFrom(from, 0.3, true);
	}

	update(dt: number, ctx: FrameContext, others: AgentActor[], meeting: boolean) {
		const previous = this.mode;
		this.mode = agentMode(this.id, ctx.t, Date.now(), meeting);
		if (previous !== this.mode) {
			this.wanderGoal = undefined;
			this.linger = 0;
		}

		// where to go
		if (this.mode === 'IDLE') {
			if (!this.wanderGoal && this.linger <= 0 && !this.path.length)
				this.wanderGoal = pickWanderSpot(this.here(), this.random);
			if (this.wanderGoal) this.head(this.wanderGoal);
		} else if (this.mode === 'SPEAKING') {
			this.head(undefined);
		} else {
			this.head(goalFor(this.id, this.mode, ctx.t));
		}

		// walk the path
		const pos = this.root.position;
		this.moving = 'still';
		if (this.path.length && this.waving <= 0) {
			const next = NODES.get(this.path[0])!;
			const dx = next.x - pos.x;
			const dz = next.z - pos.z;
			const distance = Math.hypot(dx, dz);
			// an alert runs; a meeting is called: hurry over at a jog
			const hurry = this.mode === 'ALERT' || this.mode === 'MEETING';
			const speed =
				this.mode === 'ALERT' ? SPEED.run : this.mode === 'MEETING' ? SPEED.jog : SPEED.walk;
			if (distance < 0.05) {
				this.path.shift();
				if (!this.path.length && this.mode === 'IDLE') {
					this.wanderGoal = undefined;
					this.linger = lingerSeconds(this.random);
				}
			} else {
				const step = Math.min(distance, speed * dt);
				pos.x += (dx / distance) * step;
				pos.z += (dz / distance) * step;
				this.turnTo(Math.atan2(dx, dz), dt, 10);
				this.moving = hurry ? 'run' : 'walk';
			}
		} else if (this.mode === 'IDLE') {
			this.linger -= dt;
		}

		// arrived: sit at the table, face the partner, or face the viewer to speak
		const arrived = !this.path.length;
		const chair = chairOf(this.id);
		this.seated = this.mode === 'MEETING' && arrived && this.goal === chair.id;
		if (this.seated) {
			pos.set(chair.x, 0, chair.z);
			this.turnTo(Math.atan2(TABLE.x - chair.x, TABLE.z - chair.z), dt, 6);
		} else if (arrived && this.mode === 'COLLAB') {
			const partner = others.find((other) => other.id === collabPartner(this.id, ctx.t));
			if (partner)
				this.turnTo(
					Math.atan2(partner.root.position.x - pos.x, partner.root.position.z - pos.z),
					dt,
					4
				);
		} else if (arrived && this.mode === 'SPEAKING') {
			this.turnTo(0, dt, 3);
		}

		// a wave at someone passing by, now and then
		this.waveCooldown -= dt;
		this.waving -= dt;
		if (this.mode === 'IDLE' && this.waveCooldown <= 0 && this.moving === 'walk') {
			const passer = others.find(
				(other) =>
					other !== this && other.moving !== 'still' && other.root.position.distanceTo(pos) < 2.6
			);
			if (passer) {
				this.waving = 1.8;
				this.waveCooldown = 25 + this.random() * 20;
				this.turnTo(
					Math.atan2(passer.root.position.x - pos.x, passer.root.position.z - pos.z),
					1,
					1
				);
			}
		}

		const agent = ctx.t.agents[this.id];
		const speaking =
			!!agent?.speaking || (this.id === 'orchestrator' && VOICE_TALKING.has(ctx.t.voice.phase));
		this.play(
			animationFor({
				mode: this.mode,
				motion: this.moving,
				seated: this.seated,
				speaking,
				waving: this.waving > 0
			})
		);
		this.character?.mixer.update(dt);

		if (this.character) {
			this.character.head.getWorldPosition(this.anchor);
			this.anchor.y += 0.45;
		} else this.anchor.set(pos.x, 2.1, pos.z);
	}

	private turnTo(heading: number, dt: number, rate: number) {
		let delta = heading - this.root.rotation.y;
		delta = Math.atan2(Math.sin(delta), Math.cos(delta));
		this.root.rotation.y += delta * Math.min(1, dt * rate);
	}
}

/** the five agents; their models load after, and their portraits are made then */
export function buildAgents() {
	const d = new Disposer();
	const group = new Group();
	group.name = 'agents';
	const actors = new Map<AgentId, AgentActor>();
	for (const id of AGENT_IDS) {
		const actor = new AgentActor(id, d);
		actors.set(id, actor);
		group.add(actor.root);
	}
	const list = [...actors.values()];
	return {
		group,
		actors,
		/** dresses each agent in its model; returns their portraits */
		attach(assets: CharacterAssets, renderer: WebGLRenderer) {
			const portraits = {} as Record<AgentId, string>;
			for (const actor of list) {
				const character = createCharacter(assets, actor.id, d);
				portraits[actor.id] = renderPortrait(renderer, actor.id, character);
				actor.setCharacter(character);
			}
			return portraits;
		},
		update(dt: number, ctx: FrameContext, meeting: boolean) {
			for (const actor of list) actor.update(dt, ctx, list, meeting);
		},
		dispose() {
			d.dispose();
		}
	};
}
