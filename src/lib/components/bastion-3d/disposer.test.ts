import { describe, expect, it, vi } from 'vitest';
import { Disposer } from './disposer';

const resource = () => ({ dispose: vi.fn() });

describe('disposer', () => {
	it('disposes every tracked resource once, and forgets them', () => {
		const d = new Disposer();
		const geometry = d.track(resource());
		const material = d.track(resource());
		const target = d.track(resource());
		d.track(geometry); // the same twice counts once
		expect(d.size).toBe(3);
		d.dispose();
		for (const item of [geometry, material, target]) expect(item.dispose).toHaveBeenCalledTimes(1);
		expect(d.size).toBe(0);
		d.dispose();
		expect(geometry.dispose).toHaveBeenCalledTimes(1);
	});

	it('walks a tree: geometries, materials (also arrays) and their textures', () => {
		const map = resource();
		const emissiveMap = resource();
		const a = { geometry: resource(), material: { ...resource(), map } };
		const b = { geometry: resource(), material: [{ ...resource(), emissiveMap }, resource()] };
		const root = {
			traverse(fn: (node: object) => void) {
				fn(root);
				fn(a);
				fn(b);
			}
		};
		const d = new Disposer();
		d.trackTree(root);
		expect(d.size).toBe(7);
		d.dispose();
		for (const item of [a.geometry, a.material, map, b.geometry, ...b.material, emissiveMap])
			expect(item.dispose).toHaveBeenCalledTimes(1);
	});

	it('keeps going when one fails', () => {
		const d = new Disposer();
		const bad = d.track({
			dispose: vi.fn(() => {
				throw new Error('lost context');
			})
		});
		const good = d.track(resource());
		d.dispose();
		expect(bad.dispose).toHaveBeenCalled();
		expect(good.dispose).toHaveBeenCalled();
	});
});
