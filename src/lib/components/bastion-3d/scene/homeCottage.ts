/**
 * The home cottage (bastion-ha), the coziest house: plaster on a stone base,
 * a tiled roof, flower boxes and vines, a garden with a picket fence. Its
 * windows glow with the bound light.* entities (on, brightness, colour),
 * roller shutters over them follow the bound cover.* positions, and a
 * weathervane antenna on the roof pulses for Zigbee/Thread while Home
 * Assistant answers.
 */
import { Color, Mesh, SphereGeometry, TorusGeometry, type Object3D } from 'three';
import {
	glowOnly,
	Kit,
	damp,
	lightOf,
	placeBuilding,
	setPick,
	type BuildAssets,
	type SceneModule
} from './common';
import { buildHouse, finishHouse, mergeStatic } from './buildingKit';
import { BUILDINGS } from '$lib/village/layout';
import { allOf } from '$lib/bindings';

const WARM = new Color(0xffb45c);
const WIN_W = 1.3;
const WIN_H = 1.7;
const WIN_BOTTOM = 1.05;

export function buildHomeCottage({ kits, quality }: BuildAssets): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.cottage;
	const { group, w, d } = placeBuilding(kit, b);

	const house = buildHouse(kits.village, kits.nature, kit, {
		w,
		d,
		style: 'plaster',
		roof: 'Roof_RoundTiles_6x8',
		gable: 'Roof_Front_Brick6',
		chimney: [-1.4, -2],
		windows: { front: true, back: true, sides: true },
		vines: true,
		flowerBoxes: true
	});
	finishHouse(house, kit);
	group.add(house.group);

	// a roller shutter over each window, and a light behind it
	const shutterMat = kit.mat(0x8a6a48, { roughness: 0.9 });
	const rotations = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 } as const;
	const windows = house.windowSpots.map((spot, i) => {
		const rotation = rotations[spot.side];
		const out = 0.32;
		const shutter = kit.box(WIN_W, 1, 0.05, shutterMat, 0, 0, 0);
		shutter.rotation.y = rotation;
		shutter.position.set(spot.x + Math.sin(rotation) * out, 0, spot.z + Math.cos(rotation) * out);
		shutter.castShadow = true;
		group.add(shutter);
		group.add(
			kit
				.box(
					WIN_W + 0.15,
					0.16,
					0.2,
					kit.mat(0x6b4426),
					spot.x + Math.sin(rotation) * out,
					WIN_BOTTOM + WIN_H,
					spot.z + Math.cos(rotation) * out
				)
				.rotateY(rotation)
		);
		// the window glows; the bloom does the rest
		const light = glowOnly(0xffd8a8);
		return { shutter, light, glass: house.glass[i], open: 1 };
	});

	// a garden behind, in a picket fence
	const fenceZ0 = -d / 2 - 0.6;
	const fenceZ1 = -d / 2 - 6.5;
	const fence: Object3D[] = [];
	for (let x = -w / 2 - 1; x < w / 2 + 1; x += 2.06) {
		fence.push(kits.village.clone('Prop_WoodenFence_Single', x + 1.03, 0, fenceZ1));
	}
	for (let z = fenceZ0 - 1.03; z > fenceZ1; z -= 2.06) {
		fence.push(kits.village.clone('Prop_WoodenFence_Single', -w / 2 - 1, 0, z, Math.PI / 2));
		fence.push(kits.village.clone('Prop_WoodenFence_Single', w / 2 + 1, 0, z, Math.PI / 2));
	}
	for (const piece of fence) group.add(piece);
	const beds = Math.round(6 * quality.density);
	const garden: { x: number; z: number; rotation: number; scale: number }[] = [];
	for (let i = 0; i < beds * 3; i++)
		garden.push({
			x: -w / 2 + (i % 6) * (w / 5),
			z: fenceZ1 + 1.2 + Math.floor(i / 6) * 1.4,
			rotation: i,
			scale: 0.6
		});
	group.add(
		kits.nature.instanced(
			'Flower_4_Group',
			garden.slice(0, beds * 2),
			(mesh) => kit.d.track(mesh),
			false
		)
	);
	group.add(
		kits.nature.instanced('Plant_1', garden.slice(beds * 2), (mesh) => kit.d.track(mesh), false)
	);
	group.add(kits.nature.clone('Bush_Common_Flowers', w / 2 + 1.6, 0, d / 2 - 0.5, 0, 0.8));
	group.add(kits.nature.clone('Bush_Common_Flowers', -w / 2 - 1.4, 0, d / 2 - 1, 1, 0.7));

	// the weathervane antenna on the ridge
	const top = house.height + 3.6;
	const mastMat = kit.mat(0x3b3f45, { metalness: 0.7 });
	const mast = kit.cylinder(0.04, 0.05, 1.4, mastMat, 8);
	mast.position.set(0.8, top + 0.7, 0.8);
	group.add(mast);
	const vane = kit.box(0.9, 0.05, 0.12, kit.mat(0xb08d57, { metalness: 0.7 }), 0.8, top + 1.2, 0.8);
	group.add(vane);
	const tipMat = kit.glow(0x22d3ee, 2);
	const tip = new Mesh(kit.geo(new SphereGeometry(0.1, 12, 10)), tipMat);
	tip.position.set(0.8, top + 1.5, 0.8);
	group.add(tip);
	const ringGeo = kit.geo(new TorusGeometry(0.25, 0.015, 6, 32));
	const pulses = [0, 1, 2].map(() => {
		const material = kit.basic(0x22d3ee, { transparent: true, opacity: 0, toneMapped: false });
		const ring = new Mesh(ringGeo, material);
		ring.rotation.x = Math.PI / 2;
		ring.position.copy(tip.position);
		group.add(ring);
		return { ring, material };
	});
	setPick(group, { kind: 'room', id: 'cottage' });
	// shutters, the vane and the pulses move: they stay apart
	mergeStatic(
		group,
		kit,
		new Set<Object3D>([vane, ...windows.map((w) => w.shutter), ...pulses.map((p) => p.ring)])
	);

	return {
		group,
		update(dt, ctx) {
			const lights = allOf(ctx.bindings, 'cottage', 'light');
			const covers = allOf(ctx.bindings, 'cottage', 'cover');
			windows.forEach((win, i) => {
				const id = lights.length ? lights[i % lights.length] : undefined;
				const state = lightOf(id ? ctx.t.ha[id] : undefined);
				// unbound: a homely glow at dusk
				const level = state ? state.level : lights.length ? 0 : ctx.glow * 0.6;
				if (win.glass) {
					win.glass.emissive.copy(state?.color ?? WARM);
					win.glass.emissiveIntensity = damp(win.glass.emissiveIntensity, level * 1.3, 6, dt);
				}
				if (state) win.light.color.copy(state.color);
				win.light.intensity = damp(win.light.intensity, level * 6, 6, dt);

				const cover = covers.length ? covers[i % covers.length] : undefined;
				const entity = cover ? ctx.t.ha[cover] : undefined;
				const position = entity?.attributes.current_position;
				const open =
					typeof position === 'number'
						? position / 100
						: entity
							? entity.state === 'closed'
								? 0
								: 1
							: 1;
				win.open = damp(win.open, open, 3, dt);
				const height = Math.max(0.05, (1 - win.open) * WIN_H);
				win.shutter.scale.y = height;
				win.shutter.position.y = WIN_BOTTOM + WIN_H - height / 2;
			});
			house.doorLamp.intensity = ctx.glow * 6;
			house.doorLampGlow.emissiveIntensity = ctx.glow * 3;

			const rate = ctx.t.peers.hass === 'ok' ? 1.2 : 0.3;
			vane.rotation.y = Math.sin(ctx.time * 0.3) * 1.2;
			tipMat.emissiveIntensity = 1.2 + Math.sin(ctx.time * 5 * rate) * 0.8;
			pulses.forEach(({ ring, material }, i) => {
				const phase = (ctx.time * rate + i / 3) % 1;
				ring.scale.setScalar(1 + phase * 2);
				material.opacity = (1 - phase) * 0.7;
			});
		},
		dispose() {
			kit.dispose();
		}
	};
}
