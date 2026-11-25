/**
 * Getting around the village: A* over the walking graph (layout.ts), the
 * nearest node to a point, and where an idle agent strolls next. No three.js.
 */
import {
	BUILDINGS,
	DOCK,
	EDGES,
	NODES,
	PLOTS,
	POND,
	WANDER_SPOTS,
	type NavNode,
	type Rect
} from './layout';

const neighbours = new Map<string, string[]>();
for (const [a, b] of EDGES) {
	neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
	neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
}

export const neighboursOf = (id: string) => neighbours.get(id) ?? [];

const distance = (a: NavNode, b: NavNode) => Math.hypot(a.x - b.x, a.z - b.z);

/** the node ids from `from` to `to` (both included), or undefined when there's no way */
export function findPath(from: string, to: string): string[] | undefined {
	const start = NODES.get(from);
	const goal = NODES.get(to);
	if (!start || !goal) return undefined;
	const g = new Map<string, number>([[from, 0]]);
	const f = new Map<string, number>([[from, distance(start, goal)]]);
	const came = new Map<string, string>();
	const open = new Set([from]);
	while (open.size) {
		let current = '';
		let best = Infinity;
		for (const id of open) {
			const score = f.get(id) ?? Infinity;
			if (score < best) {
				best = score;
				current = id;
			}
		}
		if (current === to) {
			const path = [current];
			while (came.has(path[0])) path.unshift(came.get(path[0])!);
			return path;
		}
		open.delete(current);
		const here = NODES.get(current)!;
		for (const next of neighboursOf(current)) {
			const tentative = (g.get(current) ?? Infinity) + distance(here, NODES.get(next)!);
			if (tentative < (g.get(next) ?? Infinity)) {
				came.set(next, current);
				g.set(next, tentative);
				f.set(next, tentative + distance(NODES.get(next)!, goal));
				open.add(next);
			}
		}
	}
	return undefined;
}

/** the node closest to a point (agents only walk on the graph, so this is the one they stand on) */
export function nearestNode(x: number, z: number): string {
	let best = '';
	let bestDistance = Infinity;
	for (const n of NODES.values()) {
		const d = Math.hypot(n.x - x, n.z - z);
		if (d < bestDistance) {
			bestDistance = d;
			best = n.id;
		}
	}
	return best;
}

/* ------------------------------------------------------------ obstacles (for tests) */

export const inRect = (x: number, z: number, r: Rect, margin = 0) =>
	Math.abs(x - r.x) < r.w / 2 + margin && Math.abs(z - r.z) < r.d / 2 + margin;

export const inPond = (x: number, z: number) =>
	((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2 < 1;

/**
 * Whether walking a straight segment hits something it shouldn't: a
 * building it isn't inside, a garden plot, or the water away from the dock.
 */
export function segmentBlocked(a: NavNode, b: NavNode, steps = 60) {
	for (let i = 0; i <= steps; i++) {
		const k = i / steps;
		const x = a.x + (b.x - a.x) * k;
		const z = a.z + (b.z - a.z) * k;
		for (const building of Object.values(BUILDINGS)) {
			const allowed = a.inside === building.id || b.inside === building.id;
			if (!allowed && inRect(x, z, building)) return `building ${building.id}`;
		}
		for (const plot of PLOTS) if (inRect(x, z, plot)) return 'garden plot';
		if (inPond(x, z) && !inRect(x, z, DOCK)) return 'pond';
	}
	return undefined;
}

/* ------------------------------------------------------------ wandering */

/** a random stroll target other than where it is, that it can reach */
export function pickWanderSpot(
	from: string,
	random: () => number = Math.random,
	spots = WANDER_SPOTS
) {
	const choices = spots.filter((spot) => spot !== from && findPath(from, spot));
	if (!choices.length) return undefined;
	return choices[Math.floor(random() * choices.length) % choices.length];
}

/** how long to linger at a spot, 5–20 s */
export const lingerSeconds = (random: () => number = Math.random) => 5 + random() * 15;
