/**
 * The five robots, one per Bastion app, each a distinct low-poly build that
 * patrols its room. Their state machine is driven by telemetry:
 *   ALERT     Watchdog on a container problem (runs to the racks), Vision
 *             Sentinel on fresh perimeter motion (runs to the window on that side)
 *   SPEAKING  its turn's answer is streaming; the Orchestrator also while HA's
 *             voice assistant goes heard → answer → speaking
 *   COLLAB    its turn runs while another robot's does: they walk toward each other
 *   WORKING   its turn runs (or waits): it goes to its station
 *   IDLE      patrols its waypoints
 */
import {
	BoxGeometry,
	Color,
	ConeGeometry,
	Group,
	Mesh,
	OctahedronGeometry,
	SphereGeometry,
	Vector3
} from 'three';
import {
	Kit,
	ROOMS,
	clamp,
	damp,
	setPick,
	type FrameContext,
	type RoomBounds
} from '../scene/common';
import { RACK_FRONT } from '../scene/serverBunker';
import { motionSide, recentMotion } from '../scene/watchtower';
import { containerAlarm } from '$lib/telemetry';
import { TARGET_AGENT } from '$lib/orders';
import { AGENT_IDS, type AgentId, type RoomId, type Telemetry } from '$lib/types';

export type AgentMode = 'IDLE' | 'WORKING' | 'COLLAB' | 'ALERT' | 'SPEAKING';

export const AGENT_NAMES: Record<AgentId, string> = {
	watchdog: 'Watchdog',
	orchestrator: 'Orchestrator',
	thermal: 'Thermal Sentinel',
	homekeeper: 'Home Keeper',
	vision: 'Vision Sentinel'
};

export const AGENT_ROOM: Record<AgentId, RoomId> = {
	watchdog: 'bunker',
	orchestrator: 'living',
	thermal: 'utility',
	homekeeper: 'studio',
	vision: 'watchtower'
};

export const MODE_COLOR: Record<AgentMode, number> = {
	IDLE: 0x38bdf8,
	WORKING: 0xfbbf24,
	COLLAB: 0xa78bfa,
	ALERT: 0xef4444,
	SPEAKING: 0x4ade80
};

const VOICE_TALKING = new Set(['heard', 'routed', 'answer', 'speaking']);

/** what a robot does now, from telemetry alone */
export function agentMode(id: AgentId, t: Telemetry, now = Date.now()): AgentMode {
	const agent = t.agents[id];
	// a fresh container problem or outage; standing ones are shown in the bunker, not alarmed
	if (id === 'watchdog' && containerAlarm(t, now)) return 'ALERT';
	if (id === 'vision' && recentMotion(t.cams.lastMotion, now)) return 'ALERT';
	if (agent?.speaking) return 'SPEAKING';
	if (id === 'orchestrator' && VOICE_TALKING.has(t.voice.phase)) return 'SPEAKING';
	// a work order: the brief goes from the Orchestrator to the app's robot
	if (orderPartner(id, t)) return 'COLLAB';
	const others = AGENT_IDS.filter((other) => other !== id && t.agents[other]?.busy);
	if (agent?.busy && others.length) return 'COLLAB';
	if (agent?.busy || agent?.state === 'waiting' || orderWork(id, t)) return 'WORKING';
	return 'IDLE';
}

const ORCHESTRATOR_BUSY = new Set(['new', 'planning', 'approved', 'ready', 'shipping']);
const APP_BUSY = new Set(['coding', 'ready']);

/** an order keeps this robot busy: the Orchestrator plans and ships, an app robot codes */
function orderWork(id: AgentId, t: Telemetry) {
	return (t.orders ?? []).some((order) =>
		id === 'orchestrator'
			? ORCHESTRATOR_BUSY.has(order.status)
			: APP_BUSY.has(order.status) && order.apps.some((app) => TARGET_AGENT[app] === id)
	);
}

/** while an approved order's brief is handed over: the other robot of that order */
function orderPartner(id: AgentId, t: Telemetry): AgentId | undefined {
	for (const order of t.orders ?? []) {
		if (order.status !== 'approved') continue;
		const robots: AgentId[] = order.apps
			.map((app) => TARGET_AGENT[app])
			.filter((r) => r !== 'orchestrator');
		if (id === 'orchestrator' && robots.length) return robots[0];
		if (robots.includes(id)) return 'orchestrator';
	}
	return undefined;
}

/** who a robot walks toward in COLLAB: its order's partner, or another robot whose turn runs */
export function collabPartner(id: AgentId, t: Telemetry): AgentId | undefined {
	return orderPartner(id, t) ?? AGENT_IDS.find((other) => other !== id && t.agents[other]?.busy);
}

type XZ = [number, number];

const PATROL: Record<AgentId, XZ[]> = {
	watchdog: [
		[7.2, -1.5],
		[11.5, -1.5],
		[11.5, 1.8],
		[7.2, 1.8]
	],
	orchestrator: [
		[-1.5, 0.5],
		[1, 2.2],
		[3.5, 0.5],
		[1, -2.6]
	],
	thermal: [
		[-8.5, -2.6],
		[-5, -2.6],
		[-5, 2.5],
		[-8.5, 2.5]
	],
	homekeeper: [
		[-8.5, -2.5],
		[-3, -2.5],
		[-3, 3],
		[-8.5, 3]
	],
	vision: [
		[1, -2.5],
		[5, -2.5],
		[5, 3.5],
		[1, 3.5]
	]
};

const STATION: Record<AgentId, XZ> = {
	watchdog: [9.1, -1.6],
	orchestrator: [3.8, -3.2],
	thermal: [-7.6, -3.2],
	homekeeper: [-6, -2.6],
	vision: [3, -3.4]
};

function inset(room: RoomBounds, margin = 0.6) {
	return {
		minX: room.minX + margin,
		maxX: room.maxX - margin,
		minZ: room.minZ + margin,
		maxZ: room.maxZ - margin
	};
}

/* ------------------------------------------------------------ robot builds */

interface Robot {
	root: Group;
	/** coloured by mode */
	eye: { color: Color; emissive: Color; emissiveIntensity: number };
	/** where the nameplate sits, in the root's space */
	headHeight: number;
	legs: Mesh[];
	ring?: Mesh[];
	head?: Group | Mesh;
}

function buildRobot(kit: Kit, id: AgentId): Robot {
	const root = new Group();
	root.name = id;
	const eye = kit.glow(MODE_COLOR.IDLE, 2.2);
	const legs: Mesh[] = [];
	switch (id) {
		case 'watchdog': {
			// a quadruped: long body, four legs, a head with a visor
			const body = kit.mat(0x1f2937, { metalness: 0.7, roughness: 0.35 });
			const accent = kit.mat(0xf59e0b, { metalness: 0.4 });
			root.add(kit.box(0.5, 0.3, 0.9, body, 0, 0.45, 0));
			root.add(kit.box(0.52, 0.06, 0.6, accent, 0, 0.76, 0));
			for (const [x, z] of [
				[-0.2, -0.32],
				[0.2, -0.32],
				[-0.2, 0.32],
				[0.2, 0.32]
			]) {
				const leg = kit.box(0.09, 0.45, 0.09, body, x, 0, z);
				legs.push(leg);
				root.add(leg);
			}
			const head = new Group();
			head.add(kit.box(0.34, 0.26, 0.34, body, 0, 0, 0));
			head.add(kit.box(0.28, 0.07, 0.02, eye, 0, 0.12, 0.18));
			head.add(kit.box(0.04, 0.16, 0.04, accent, 0.12, 0.26, -0.05));
			head.position.set(0, 0.62, 0.5);
			root.add(head);
			return { root, eye, headHeight: 1.25, legs, head };
		}
		case 'orchestrator': {
			// tall and slim, with a halo; the waveform ring hangs around its waist
			const body = kit.mat(0xe2e8f0, { metalness: 0.5, roughness: 0.25 });
			const accent = kit.mat(0x7c3aed, { metalness: 0.4 });
			root.add(kit.box(0.42, 0.75, 0.28, body, 0, 0.8, 0));
			root.add(kit.box(0.44, 0.12, 0.3, accent, 0, 1.2, 0));
			for (const x of [-0.12, 0.12]) {
				const leg = kit.box(0.12, 0.8, 0.14, body, x, 0, 0);
				legs.push(leg);
				root.add(leg);
			}
			for (const x of [-0.28, 0.28]) root.add(kit.box(0.08, 0.6, 0.1, body, x, 0.85, 0));
			const head = new Group();
			head.add(new Mesh(kit.geo(new SphereGeometry(0.17, 14, 10)), body));
			head.add(kit.box(0.22, 0.05, 0.02, eye, 0, 0.02, 0.16));
			const halo = new Mesh(kit.geo(new BoxGeometry(0.5, 0.02, 0.5)), eye);
			halo.position.y = 0.3;
			head.add(halo);
			head.position.y = 1.75;
			root.add(head);
			const barGeo = kit.boxGeo(0.04, 0.3, 0.04);
			const barMat = kit.glow(0x4ade80, 2);
			const ring: Mesh[] = [];
			for (let i = 0; i < 24; i++) {
				const bar = new Mesh(barGeo, barMat);
				const a = (i / 24) * Math.PI * 2;
				bar.position.set(Math.cos(a) * 0.55, 1.0, Math.sin(a) * 0.55);
				ring.push(bar);
				root.add(bar);
			}
			return { root, eye, headHeight: 2.35, legs, ring, head };
		}
		case 'thermal': {
			// squat barrel with cooling fins, orange
			const body = kit.mat(0xea580c, { metalness: 0.5, roughness: 0.4 });
			const fin = kit.mat(0x7c2d12, { metalness: 0.6 });
			const barrel = kit.cylinder(0.32, 0.36, 0.7, body, 10);
			barrel.position.y = 0.6;
			root.add(barrel);
			for (let i = 0; i < 6; i++) {
				const f = kit.box(0.04, 0.5, 0.18, fin, 0, 0.35, 0);
				const a = (i / 6) * Math.PI * 2;
				f.position.set(Math.cos(a) * 0.36, 0.38, Math.sin(a) * 0.36);
				f.rotation.y = -a;
				root.add(f);
			}
			for (const x of [-0.18, 0.18]) {
				const leg = kit.box(0.14, 0.25, 0.2, fin, x, 0, 0);
				legs.push(leg);
				root.add(leg);
			}
			const dome = new Mesh(
				kit.geo(new SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
				body
			);
			dome.position.y = 0.95;
			root.add(dome);
			root.add(kit.box(0.36, 0.08, 0.02, eye, 0, 1.02, 0.28));
			return { root, eye, headHeight: 1.6, legs, head: dome };
		}
		case 'homekeeper': {
			// a round body on one wheel, with an antenna
			const body = kit.mat(0x0ea5e9, { metalness: 0.3, roughness: 0.3 });
			const dark = kit.mat(0x0f172a, { metalness: 0.6 });
			const sphere = new Mesh(kit.geo(new SphereGeometry(0.36, 16, 12)), body);
			sphere.position.y = 0.7;
			root.add(sphere);
			const wheel = kit.cylinder(0.16, 0.16, 0.12, dark, 14);
			wheel.rotation.z = Math.PI / 2;
			wheel.position.y = 0.17;
			legs.push(wheel);
			root.add(wheel);
			root.add(kit.box(0.08, 0.2, 0.08, dark, 0, 0.25, 0));
			const visor = kit.box(0.42, 0.12, 0.08, dark, 0, 0.72, 0.3);
			root.add(visor);
			root.add(kit.box(0.3, 0.05, 0.02, eye, 0, 0.72, 0.35));
			const antenna = kit.cylinder(0.015, 0.015, 0.35, dark, 6);
			antenna.position.set(0.12, 1.2, 0);
			root.add(antenna);
			const tip = new Mesh(kit.geo(new SphereGeometry(0.05, 8, 6)), eye);
			tip.position.set(0.12, 1.4, 0);
			root.add(tip);
			return { root, eye, headHeight: 1.7, legs, head: sphere };
		}
		case 'vision': {
			// a tripod with one big lens
			const body = kit.mat(0x334155, { metalness: 0.7, roughness: 0.3 });
			const white = kit.mat(0xf8fafc, { roughness: 0.5 });
			for (let i = 0; i < 3; i++) {
				const a = (i / 3) * Math.PI * 2;
				const leg = kit.box(0.06, 0.9, 0.06, body, 0, 0, 0);
				leg.position.set(Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22);
				leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
				legs.push(leg);
				root.add(leg);
			}
			const head = new Group();
			head.add(new Mesh(kit.geo(new OctahedronGeometry(0.3, 0)), white));
			const lens = kit.cylinder(0.14, 0.17, 0.22, body, 16);
			lens.rotation.x = Math.PI / 2;
			lens.position.z = 0.25;
			head.add(lens);
			const iris = new Mesh(kit.geo(new SphereGeometry(0.09, 12, 8)), eye);
			iris.position.z = 0.37;
			head.add(iris);
			const fin = new Mesh(kit.geo(new ConeGeometry(0.06, 0.25, 4)), body);
			fin.position.y = 0.33;
			head.add(fin);
			head.position.y = 1.05;
			root.add(head);
			return { root, eye, headHeight: 1.75, legs, head };
		}
	}
}

/* ------------------------------------------------------------ the controller */

export class AgentActor {
	readonly id: AgentId;
	readonly root: Group;
	mode: AgentMode = 'IDLE';
	/** world position of the nameplate */
	readonly anchor = new Vector3();
	private robot: Robot;
	private room: RoomBounds;
	private waypoint = 0;
	private pause = 0;
	private walk = 0;
	private eyeColor = new Color(MODE_COLOR.IDLE);
	private target = new Color();

	constructor(kit: Kit, id: AgentId) {
		this.id = id;
		this.robot = buildRobot(kit, id);
		this.root = this.robot.root;
		setPick(this.root, { kind: 'agent', id });
		this.room = ROOMS[AGENT_ROOM[id]];
		const [x, z] = PATROL[id][0];
		this.root.position.set(x, this.room.y, z);
	}

	private goal(ctx: FrameContext, actors: Map<AgentId, AgentActor>): XZ | undefined {
		const bounds = inset(this.room);
		switch (this.mode) {
			case 'ALERT':
				if (this.id === 'watchdog') return [RACK_FRONT.x, RACK_FRONT.z];
				if (this.id === 'vision') {
					const side = ctx.t.cams.lastMotion ? motionSide(ctx.t.cams.lastMotion.camera) : 0.6;
					// toward the front edge, left or right by the side the motion came from
					return [clamp(3 + Math.sin(side) * 2.5, bounds.minX, bounds.maxX), bounds.maxZ];
				}
				return STATION[this.id];
			case 'WORKING':
				return STATION[this.id];
			case 'COLLAB': {
				const partner = collabPartner(this.id, ctx.t);
				const other = partner && actors.get(partner);
				if (!other) return STATION[this.id];
				const p = other.root.position;
				return [clamp(p.x, bounds.minX, bounds.maxX), clamp(p.z, bounds.minZ, bounds.maxZ)];
			}
			case 'SPEAKING':
				return undefined;
			case 'IDLE':
				return PATROL[this.id][this.waypoint];
		}
	}

	update(dt: number, ctx: FrameContext, actors: Map<AgentId, AgentActor>) {
		this.mode = agentMode(this.id, ctx.t);
		const goal = this.goal(ctx, actors);
		const pos = this.root.position;
		let moving = false;
		if (goal) {
			const dx = goal[0] - pos.x;
			const dz = goal[1] - pos.z;
			const distance = Math.hypot(dx, dz);
			const speed = this.mode === 'ALERT' ? 3.2 : this.mode === 'IDLE' ? 0.9 : 1.6;
			const stopAt = this.mode === 'COLLAB' ? 0.9 : 0.05;
			if (distance > stopAt && this.pause <= 0) {
				const step = Math.min(distance - stopAt, speed * dt);
				pos.x += (dx / distance) * step;
				pos.z += (dz / distance) * step;
				const heading = Math.atan2(dx, dz);
				let delta = heading - this.root.rotation.y;
				delta = Math.atan2(Math.sin(delta), Math.cos(delta));
				this.root.rotation.y += delta * Math.min(1, dt * 8);
				moving = true;
			} else if (this.mode === 'IDLE') {
				if (this.pause <= 0) this.pause = 1.5 + Math.random() * 2.5;
				this.pause -= dt;
				if (this.pause <= 0) this.waypoint = (this.waypoint + 1) % PATROL[this.id].length;
			}
		} else {
			// speaking: turn toward the viewer (+z)
			let delta = 0 - this.root.rotation.y;
			delta = Math.atan2(Math.sin(delta), Math.cos(delta));
			this.root.rotation.y += delta * Math.min(1, dt * 4);
		}
		if (this.mode !== 'IDLE') this.pause = 0;

		// animation: legs, a bob while walking, the eye's colour, the head
		this.walk += dt * (moving ? (this.mode === 'ALERT' ? 16 : 8) : 0);
		this.robot.legs.forEach((leg, i) => {
			leg.rotation.x = moving
				? Math.sin(this.walk + i * Math.PI) * 0.4
				: damp(leg.rotation.x, 0, 8, dt);
		});
		this.root.position.y = this.room.y + (moving ? Math.abs(Math.sin(this.walk)) * 0.04 : 0);
		this.target.setHex(MODE_COLOR[this.mode]);
		this.eyeColor.lerp(this.target, Math.min(1, dt * 6));
		this.robot.eye.color.copy(this.eyeColor);
		this.robot.eye.emissive.copy(this.eyeColor);
		const flash = this.mode === 'ALERT' ? 1.5 + Math.sin(ctx.time * 16) * 1.2 : 2.2;
		this.robot.eye.emissiveIntensity =
			this.mode === 'SPEAKING' ? 2 + Math.sin(ctx.time * 12) * 0.8 : flash;
		if (this.robot.head && this.mode === 'WORKING')
			this.robot.head.rotation.y = Math.sin(ctx.time * 1.5) * 0.4;
		else if (this.robot.head)
			this.robot.head.rotation.y = damp(this.robot.head.rotation.y, 0, 4, dt);

		// the Orchestrator's waveform: bars pulse with the voice assistant
		if (this.robot.ring) {
			const phase = ctx.t.voice.phase;
			const level = phase === 'speaking' ? 1 : phase === 'idle' ? 0.08 : 0.55;
			this.robot.ring.forEach((bar, i) => {
				const wave =
					0.3 + Math.abs(Math.sin(ctx.time * 9 + i * 0.7) * Math.sin(ctx.time * 3.1 + i * 0.3));
				bar.scale.y = damp(bar.scale.y, 0.15 + wave * level * 2.2, 10, dt);
			});
		}

		this.anchor.set(pos.x, pos.y + this.robot.headHeight, pos.z);
	}
}

/** builds all five robots in one group, with one kit to dispose them */
export function buildAgents() {
	const kit = new Kit();
	const group = kit.group('agents');
	const actors = new Map<AgentId, AgentActor>();
	for (const id of AGENT_IDS) {
		const actor = new AgentActor(kit, id);
		actors.set(id, actor);
		group.add(actor.root);
	}
	return {
		group,
		actors,
		update(dt: number, ctx: FrameContext) {
			for (const actor of actors.values()) actor.update(dt, ctx, actors);
		},
		dispose() {
			kit.dispose();
		}
	};
}
