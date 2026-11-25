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

	it('covers skinned meshes, instanced meshes, mixers and render targets', () => {
		const skeleton = resource();
		const instanced = {
			isInstancedMesh: true,
			dispose: vi.fn(),
			geometry: resource(),
			material: resource()
		};
		const skinned = { geometry: resource(), material: resource(), skeleton };
		const root = {
			traverse(fn: (node: object) => void) {
				fn(root);
				fn(skinned);
				fn(instanced);
			}
		};
		const mixer = { stopAllAction: vi.fn(), uncacheRoot: vi.fn() };
		const target = resource();
		const d = new Disposer();
		d.trackTree(root);
		d.trackMixer(mixer, root);
		d.track(target);
		d.dispose();
		for (const item of [
			skeleton,
			skinned.geometry,
			skinned.material,
			instanced.geometry,
			instanced.material,
			target
		])
			expect(item.dispose).toHaveBeenCalledTimes(1);
		expect(instanced.dispose).toHaveBeenCalledTimes(1);
		expect(mixer.stopAllAction).toHaveBeenCalled();
		expect(mixer.uncacheRoot).toHaveBeenCalledWith(root);
	});
});
