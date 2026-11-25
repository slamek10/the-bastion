/**
 * The village's plan, in metres on the ground (x east, z south), with no
 * three.js in it so it can be tested: the buildings and garden plots (which
 * nothing walks through), the pond, and the walking graph along the paths,
 * the plaza and into the buildings through their doors.
 */
import type { AgentId, RoomId } from '$lib/types';

export type BuildingId = Exclude<RoomId, 'pond'>;

export interface Rect {
	/** centre */
	x: number;
	z: number;
	/** size along x and z */
	w: number;
	d: number;
}

export interface Building extends Rect {
	id: BuildingId;
	/** which side the door is on */
	facing: 'n' | 's' | 'e' | 'w';
	/** the walking node at its door, outside */
	door: string;
	/** where its agent works (WORKING) */
	work: string;
}

/** footprints on the building kit's 2 m grid (the tower is round) */
export const BUILDINGS: Record<BuildingId, Building> = {
	townhall: {
		id: 'townhall',
		x: 0,
		z: -18.2,
		w: 8,
		d: 12,
		facing: 's',
		door: 'th_door',
		work: 'th_in'
	},
	forge: {
		id: 'forge',
		x: -20,
		z: -14,
		w: 8,
		d: 8,
		facing: 's',
		door: 'forge_door',
		work: 'forge_door'
	},
	boiler: {
		id: 'boiler',
		x: -21,
		z: 10,
		w: 6,
		d: 6,
		facing: 'e',
		door: 'boiler_door',
		work: 'boiler_door'
	},
	cottage: {
		id: 'cottage',
		x: -4,
		z: 22,
		w: 6,
		d: 8,
		facing: 'n',
		door: 'cottage_door',
		work: 'cottage_door'
	},
	tower: {
		id: 'tower',
		x: 21,
		z: -8,
		w: 5,
		d: 5,
		facing: 'w',
		door: 'tower_door',
		work: 'tower_door'
	}
};

/** walled garden plots: walked around, entered nowhere */
export const PLOTS: Rect[] = [
	{ x: 9, z: -14, w: 6, d: 5 },
	{ x: -14, z: 20, w: 6, d: 5 }
];

export const PLAZA = { x: 0, z: 0, r: 7, fountain: 2.2 };

export const POND = { x: 19, z: 12, rx: 9, rz: 6 };
/** the dock: the one way onto the water */
export const DOCK: Rect = { x: 12.6, z: 12, w: 6.4, d: 1.2 };
/** the lit swimming area in the pond (the pond's pool light) */
export const SWIM: Rect = { x: 22, z: 14.2, w: 6, d: 3 };

export const TABLE = { x: 0, z: -18.5, r: 1.3 };

export interface NavNode {
	id: string;
	x: number;
	z: number;
	/** a node inside this building, reached only through its door */
	inside?: BuildingId;
	/** on the dock */
	dock?: boolean;
}

const nodes: NavNode[] = [];
const edges: [string, string][] = [];
const node = (id: string, x: number, z: number, extra: Partial<NavNode> = {}) => {
	nodes.push({ id, x, z, ...extra });
	return id;
};
const link = (...ids: string[]) => {
	for (let i = 1; i < ids.length; i++) edges.push([ids[i - 1], ids[i]]);
};

// the plaza: a ring around the fountain, benches, two spots to meet
const ring = Array.from({ length: 8 }, (_, k) =>
	node(
		`p${k}`,
		Math.round(4.5 * Math.cos((k * Math.PI) / 4) * 100) / 100,
		Math.round(4.5 * Math.sin((k * Math.PI) / 4) * 100) / 100
	)
);
for (let k = 0; k < 8; k++) link(ring[k], ring[(k + 1) % 8]);
for (const k of [1, 3, 5, 7]) {
	const a = (k * Math.PI) / 4;
	link(
		ring[k],
		node(
			`bench${k}`,
			Math.round(6 * Math.cos(a) * 100) / 100,
			Math.round(6 * Math.sin(a) * 100) / 100
		)
	);
}
link(ring[2], node('meet_a', -1, 5.2));
link(ring[2], node('meet_b', 1, 5.2));

// north: the town hall, its table and chairs
link(
	ring[6],
	node('n1', 0, -8),
	node('th_door', 0, -11.3),
	node('th_in', 0, -14.6, { inside: 'townhall' })
);
const tableRing = Array.from({ length: 8 }, (_, k) => {
	const a = Math.PI / 2 + (k * Math.PI) / 4;
	return node(
		`tr${k}`,
		Math.round((TABLE.x + 3 * Math.cos(a)) * 100) / 100,
		Math.round((TABLE.z + 3 * Math.sin(a)) * 100) / 100,
		{
			inside: 'townhall'
		}
	);
});
for (let k = 0; k < 8; k++) link(tableRing[k], tableRing[(k + 1) % 8]);
link('th_in', tableRing[0]);

/** the meeting chairs around the table: angle (rad, 0 = east) and the ring node it's reached from */
export const CHAIRS = Array.from({ length: 6 }, (_, i) => {
	// the head of the table faces the door; the rest around it
	const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
	const x = Math.round((TABLE.x + 2.05 * Math.cos(angle)) * 100) / 100;
	const z = Math.round((TABLE.z + 2.05 * Math.sin(angle)) * 100) / 100;
	const id = node(`chair${i}`, x, z, { inside: 'townhall' });
	// the nearest node of the walking ring
	const near = tableRing
		.map((rid) => nodes.find((n) => n.id === rid)!)
		.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
	link(near.id, id);
	return { id, x, z, angle };
});

// north-west: the forge
link(ring[5], node('w1', -9, -6), node('w2', -15, -7.8), node('forge_door', -20, -9.3));
// west: the boiler house
link(ring[4], node('w3', -10, 3), node('boiler_door', -16.3, 10));
// south: the cottage
link(ring[2], node('s1', -2, 10), node('cottage_door', -4, 17.3));
// east: the vision tower
link(ring[0], node('e1', 10, 0), node('e2', 14, -5), node('tower_door', 17.8, -8));
// the pond: the shore, the dock, the swimming area
link(
	'e1',
	node('e3', 8, 6),
	node('shore', 8.8, 12),
	node('dock_mid', 12, 12, { dock: true }),
	node('dock_end', 15.2, 12, { dock: true })
);
link('shore', node('ps1', 9, 17.5), node('pond_south', 15, 19.6));
// the garden plots' gates
link('n1', node('plot_a', 9, -10.6), 'e2');
link('s1', node('plot_b', -14, 16.6), 'boiler_door');

export const NODES: ReadonlyMap<string, NavNode> = new Map(nodes.map((n) => [n.id, n]));
export const EDGES: ReadonlyArray<[string, string]> = edges;

/** places an idle agent strolls to */
export const WANDER_SPOTS = [
	'bench1',
	'bench3',
	'bench5',
	'bench7',
	'p2',
	'p6',
	'dock_end',
	'pond_south',
	'plot_a',
	'plot_b',
	'th_door',
	'forge_door',
	'boiler_door',
	'cottage_door',
	'tower_door'
];

/** each agent's building */
export const AGENT_BUILDING: Record<AgentId, BuildingId> = {
	orchestrator: 'townhall',
	watchdog: 'forge',
	thermal: 'boiler',
	homekeeper: 'cottage',
	vision: 'tower'
};

/** where each agent starts */
export const START: Record<AgentId, string> = {
	orchestrator: 'p6',
	watchdog: 'forge_door',
	thermal: 'boiler_door',
	homekeeper: 'cottage_door',
	vision: 'tower_door'
};
