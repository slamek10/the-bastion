import { describe, expect, it } from 'vitest';
import { BUILDINGS, CHAIRS, EDGES, NODES, PLOTS, WANDER_SPOTS } from './layout';
import {
	findPath,
	inPond,
	inRect,
	nearestNode,
	pickWanderSpot,
	segmentBlocked
} from './navigation';

const doors = Object.values(BUILDINGS).map((b) => b.door);

describe('village navigation', () => {
	it('no edge goes through a building, a garden plot or the pond', () => {
		for (const [a, b] of EDGES) {
			const blocked = segmentBlocked(NODES.get(a)!, NODES.get(b)!);
			expect(blocked, `${a} → ${b}`).toBeUndefined();
		}
	});

	it('no node outside a building stands in one, nor in the pond away from the dock', () => {
		for (const n of NODES.values()) {
			for (const building of Object.values(BUILDINGS))
				if (n.inside !== building.id) expect(inRect(n.x, n.z, building), n.id).toBe(false);
			for (const plot of PLOTS) expect(inRect(n.x, n.z, plot), n.id).toBe(false);
			if (!n.dock) expect(inPond(n.x, n.z), n.id).toBe(false);
		}
	});

	it('finds a path between every pair of doors, along edges only', () => {
		const edgeSet = new Set(EDGES.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
		for (const from of doors)
			for (const to of doors) {
				const path = findPath(from, to);
				expect(path, `${from} → ${to}`).toBeDefined();
				expect(path![0]).toBe(from);
				expect(path![path!.length - 1]).toBe(to);
				for (let i = 1; i < path!.length; i++)
					expect(edgeSet.has(`${path![i - 1]}|${path![i]}`)).toBe(true);
			}
	});

	it('enters a building only through its door', () => {
		const path = findPath('forge_door', 'chair3')!;
		const firstInside = path.findIndex((id) => NODES.get(id)!.inside);
		expect(path[firstInside - 1]).toBe('th_door');
	});

	it('reaches every chair and every wander spot from the plaza', () => {
		for (const chair of CHAIRS) expect(findPath('p0', chair.id)).toBeDefined();
		for (const spot of WANDER_SPOTS) expect(findPath('p0', spot), spot).toBeDefined();
	});

	it('wander picks only reachable spots, never where it is', () => {
		let seed = 7;
		const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		for (let i = 0; i < 200; i++) {
			const from = WANDER_SPOTS[i % WANDER_SPOTS.length];
			const spot = pickWanderSpot(from, random)!;
			expect(spot).not.toBe(from);
			expect(WANDER_SPOTS).toContain(spot);
			expect(findPath(from, spot)).toBeDefined();
		}
		// an unreachable spot is never picked
		expect(pickWanderSpot('p0', () => 0, ['nowhere', 'bench1'])).toBe('bench1');
	});

	it('the nearest node to a node is itself', () => {
		for (const n of NODES.values()) expect(nearestNode(n.x, n.z)).toBe(n.id);
	});
});
