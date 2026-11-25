/**
 * The two-story cutaway house: floors, the back and side walls (the front and
 * the roof are cut away), the stairs, the annex for the server bunker, the
 * ground around it, and the light rigs for twilight and day.
 */
import {
	AmbientLight,
	Color,
	DirectionalLight,
	Fog,
	HemisphereLight,
	Mesh,
	PointLight,
	type Scene
} from 'three';
import { FLOOR2, Kit, ROOMS, damp, lerp, lightOf, setPick, type SceneModule } from './common';
import { firstOf } from '$lib/bindings';
import type { RoomId } from '$lib/types';

const WALL = 0.2;
const WARM = new Color(0xffd8a8);
const H = 3.2;

export function buildHouse(scene: Scene): SceneModule {
	const kit = new Kit();
	const group = kit.group('house');

	const floorMat = kit.mat(0x2a3142, { roughness: 0.9 });
	const floor2Mat = kit.mat(0x323a4f, { roughness: 0.85 });
	const wallMat = kit.mat(0x3a4256, { roughness: 0.95 });
	const trimMat = kit.glow(0x38bdf8, 0.6);
	const groundMat = kit.mat(0x14251c, { roughness: 1 });
	const pathMat = kit.mat(0x3a3f4a, { roughness: 1 });

	// ground
	const ground = kit.plane(80, 80, groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.02;
	group.add(ground);
	const path = kit.plane(3, 10, pathMat);
	path.rotation.x = -Math.PI / 2;
	path.position.set(9, -0.01, 10);
	group.add(path);

	// floors, each a pickable room
	const floors: [RoomId, typeof floorMat][] = [
		['utility', floorMat],
		['living', floorMat],
		['bunker', kit.mat(0x1f2633, { roughness: 0.6, metalness: 0.4 })],
		['studio', floor2Mat],
		['watchtower', floor2Mat]
	];
	for (const [id, material] of floors) {
		const room = ROOMS[id];
		const w = room.maxX - room.minX;
		const d = room.maxZ - room.minZ;
		const slab = kit.box(
			w,
			0.2,
			d,
			material,
			(room.minX + room.maxX) / 2,
			room.y - 0.2,
			(room.minZ + room.maxZ) / 2
		);
		setPick(slab, { kind: 'room', id });
		group.add(slab);
		// a thin glowing edge on the cut side
		const edge = kit.box(
			w,
			0.04,
			0.04,
			trimMat,
			(room.minX + room.maxX) / 2,
			room.y - 0.02,
			room.maxZ
		);
		group.add(edge);
	}

	// walls: back (z = -5), left (x = -10), the annex
	const add = (mesh: Mesh) => group.add(mesh);
	add(kit.box(16, H * 2, WALL, wallMat, -2, 0, -5));
	add(kit.box(WALL, H * 2, 10, wallMat, -10, 0, 0));
	// ground floor partition utility | living, with a door gap
	add(kit.box(WALL, H, 6, wallMat, -4, 0, -2));
	add(kit.box(WALL, 0.6, 2, wallMat, -4, H - 0.6, 2));
	// living | bunker, with a door gap
	add(kit.box(WALL, H, 5, wallMat, 6, 0, -2.5));
	add(kit.box(WALL, 0.6, 2.2, wallMat, 6, H - 0.6, 1));
	// the annex: back, right, a flat roof edge only
	add(kit.box(7, 3, WALL, wallMat, 9.5, 0, -5));
	add(kit.box(WALL, 3, 8, wallMat, 13, 0, -1));
	// upper floor: studio | watchtower half wall, right wall
	add(kit.box(WALL, 1.2, 10, wallMat, 0, FLOOR2, 0));
	add(kit.box(WALL, H, 10, wallMat, 6, FLOOR2, 0));
	// low parapet along the cut-away front of the upper floor
	add(
		kit.box(16, 0.25, 0.12, kit.mat(0x94a3b8, { metalness: 0.6, roughness: 0.3 }), -2, FLOOR2, 5)
	);

	// stairs in the living room, along the back wall
	const stepMat = kit.mat(0x475569, { roughness: 0.7 });
	const steps = 14;
	for (let i = 0; i < steps; i++) {
		const h = ((i + 1) * FLOOR2) / steps;
		add(kit.box(0.4, 0.12, 1.4, stepMat, -3.6 + i * 0.4, h - 0.12, -4.2));
	}

	// lights
	const hemi = new HemisphereLight(0x8ab4ff, 0x101820, 0.6);
	const ambient = new AmbientLight(0x404a70, 0.4);
	const sun = new DirectionalLight(0xffffff, 1);
	sun.position.set(20, 30, 18);
	group.add(hemi, ambient, sun);

	// room lights, from the rooms' first bound light
	const roomLights: [RoomId, PointLight][] = [
		['living', new PointLight(0xffd8a8, 0, 14, 1.6)],
		['utility', new PointLight(0xffd8a8, 0, 10, 1.6)],
		['studio', new PointLight(0xffd8a8, 0, 14, 1.6)],
		['watchtower', new PointLight(0xa5b4fc, 0, 10, 1.6)]
	];
	for (const [id, light] of roomLights) {
		const room = ROOMS[id];
		light.position.set((room.minX + room.maxX) / 2, room.y + 2.7, (room.minZ + room.maxZ) / 2 - 1);
		group.add(light);
	}

	const twilightSky = new Color(0x0b1024);
	const daySky = new Color(0x9cc7ef);
	const sky = new Color();
	const fog = new Fog(0x0b1024, 30, 90);
	scene.fog = fog;
	scene.background = sky;

	const target = new Color();
	return {
		group,
		update(dt, ctx) {
			const day = ctx.day;
			sky.copy(twilightSky).lerp(daySky, day);
			fog.color.copy(sky);
			hemi.intensity = lerp(0.9, 1.1, day);
			ambient.intensity = lerp(0.6, 0.5, day);
			sun.intensity = lerp(0.15, 2.2, day);
			sun.color.setHex(day > 0.5 ? 0xfff4e0 : 0x8090ff);
			for (const [id, light] of roomLights) {
				const entity = firstOf(ctx.bindings, id, 'light');
				const state = lightOf(entity ? ctx.t.ha[entity] : undefined);
				// unbound rooms keep a soft default glow at twilight
				const level = state ? state.level * 18 : entity ? 0 : lerp(5, 0, day);
				target.copy(state?.color ?? WARM);
				light.color.lerp(target, Math.min(1, dt * 6));
				light.intensity = damp(light.intensity, level, 6, dt);
			}
		},
		dispose() {
			scene.fog = null;
			scene.background = null;
			kit.dispose();
		}
	};
}
