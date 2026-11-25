/**
 * The town hall (Orchestrator's home, bastion-ai): the largest building, a
 * plaster hall on a stone base with a tiled roof, steps and banners, the
 * meeting table and six chairs inside, and a brick clock tower behind it
 * with a lit clock face and the AI core on top (a crystal in a glass dome
 * that spins faster while an agent turn runs or the voice assistant speaks).
 * Its roof and front fade out when the camera comes close, on the Town Hall
 * preset, or during a meeting, so the table shows.
 */
import {
	Mesh,
	MeshBasicMaterial,
	OctahedronGeometry,
	PointLight,
	SphereGeometry,
	TorusGeometry
} from 'three';
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
import { buildHouse, finishHouse, makeFader, mergeStatic, STOREY } from './buildingKit';
import { BUILDINGS, CHAIRS, TABLE } from '$lib/village/layout';
import { firstOf } from '$lib/bindings';
import { voiceActive } from '$lib/telemetry';
import { PEOPLE_SCALE } from '$lib/village/lighting';

export function buildTownHall({ kits }: BuildAssets): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.townhall;
	const { group: hall, w, d } = placeBuilding(kit, b);
	const outer = kit.group('townHall');
	outer.add(hall);

	const house = buildHouse(kits.village, kits.nature, kit, {
		w,
		d,
		style: 'plaster',
		roof: 'Roof_RoundTiles_8x12',
		gable: 'Roof_Front_Brick8',
		windows: { front: true, back: false, sides: true },
		vines: true,
		flowerBoxes: true,
		openDoor: true
	});
	hall.add(house.group);
	const fade = makeFader(house.fading, kit);
	finishHouse(house, kit);

	// a wooden floor inside, steps in front
	for (let x = -w / 2 + 1; x < w / 2; x += 2)
		for (let z = -d / 2 + 1; z < d / 2; z += 2)
			hall.add(kits.village.clone('Floor_WoodDark', x, 0.02, z));
	hall.add(kits.village.clone('Stairs_Exterior_Straight', 0, -0.75, d / 2 + 0.9));
	// banners either side of the door, in the agents' colours
	for (const [x, color] of [
		[-2.3, 0xa78bfa],
		[2.3, 0x38bdf8]
	] as const) {
		const banner = kit.box(
			0.7,
			1.4,
			0.04,
			kit.mat(color, { roughness: 0.9 }),
			x,
			1.2,
			d / 2 + 0.12
		);
		hall.add(banner);
		hall.add(kit.box(0.9, 0.05, 0.05, kit.mat(0x6b4426), x, 2.62, d / 2 + 0.14));
	}
	setPick(hall, { kind: 'room', id: 'townhall' });

	// the clock tower behind the hall: three brick storeys
	const tower = kit.group('clockTower');
	for (let storey = 0; storey < 3; storey++) {
		const y = storey * STOREY;
		for (const [x, z, rotation] of [
			[0, 2 - 0.09, 0],
			[0, -2 + 0.09, Math.PI],
			[2 - 0.09, 0, Math.PI / 2],
			[-2 + 0.09, 0, -Math.PI / 2]
		] as const) {
			for (const offset of [-1, 1]) {
				const along = rotation === 0 || rotation === Math.PI ? [offset, 0] : [0, offset];
				const piece =
					storey === 2 ? 'Wall_UnevenBrick_Window_Thin_Round' : 'Wall_UnevenBrick_Straight';
				tower.add(kits.village.clone(piece, x + along[0], y, z + along[1], rotation));
			}
		}
		for (const [x, z] of [
			[-2, -2],
			[2, -2],
			[-2, 2],
			[2, 2]
		])
			tower.add(kits.village.clone('Corner_Exterior_Brick', x, y, z));
	}
	const top = 3 * STOREY;
	tower.add(kit.box(4.6, 0.3, 4.6, kit.mat(0x8f8679, { roughness: 1 }), 0, top, 0));
	const clock = kit.canvas(256, 256);
	const face = kit.screen(clock, 1.7, 1.7);
	face.position.set(0, top - 1.6, 2.12);
	(face.material as MeshBasicMaterial).transparent = true;
	tower.add(face);
	const clockLight = glowOnly(0xffe2b0);
	tower.position.set(0, 0, -d / 2 - 2);
	setPick(tower, { kind: 'room', id: 'townhall' });
	hall.add(tower);

	// the AI core: a crystal and rings in a glass dome on the tower
	const coreY = top + 1.3;
	const coreMat = kit.mat(0xa78bfa, {
		emissive: 0x7c3aed,
		emissiveIntensity: 1.6,
		flatShading: true,
		roughness: 0.2
	});
	const crystal = new Mesh(kit.geo(new OctahedronGeometry(0.6, 0)), coreMat);
	crystal.position.set(0, coreY, -d / 2 - 2);
	hall.add(crystal);
	const rings = [kit.glow(0x38bdf8, 1.6), kit.glow(0xf472b6, 1.4)].map((material, i) => {
		const ring = new Mesh(kit.geo(new TorusGeometry(0.95 + i * 0.2, 0.03, 8, 48)), material);
		ring.position.copy(crystal.position);
		ring.rotation.x = Math.PI / 2 + i * 0.6;
		hall.add(ring);
		return ring;
	});
	const dome = new Mesh(
		kit.geo(new SphereGeometry(1.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
		kit.mat(0xd6ecff, { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 })
	);
	dome.position.set(0, top + 0.15, -d / 2 - 2);
	hall.add(dome);
	const coreLight = new PointLight(0x8b5cf6, 6, 14, 1.6);
	coreLight.position.copy(crystal.position);
	hall.add(coreLight);
	setPick(crystal, { kind: 'room', id: 'townhall' });

	// the meeting table and chairs, in village coordinates
	const furniture = kit.group('meeting');
	const wood = kits.village.material('MI_WoodTrim') ?? kit.mat(0x8a5a35);
	const table = kit.cylinder(TABLE.r, TABLE.r, 0.08, wood, 32);
	// furniture sized for the storybook people
	table.position.set(TABLE.x, 0.78 * PEOPLE_SCALE, TABLE.z);
	table.castShadow = true;
	furniture.add(table);
	const leg = kit.cylinder(0.15, 0.3, 0.75, wood, 10);
	leg.position.set(TABLE.x, 0.37 * PEOPLE_SCALE, TABLE.z);
	leg.scale.y = PEOPLE_SCALE;
	furniture.add(leg);
	const candle = kit.cylinder(
		0.05,
		0.05,
		0.2,
		kit.mat(0xfff4d6, { emissive: 0xffb45c, emissiveIntensity: 0.6 }),
		8
	);
	candle.position.set(TABLE.x, 0.78 * PEOPLE_SCALE + 0.14, TABLE.z);
	furniture.add(candle);
	for (const chair of CHAIRS) {
		const c = kit.group('chair');
		c.add(kit.box(0.5, 0.06, 0.5, wood, 0, 0.44, 0));
		c.add(kit.box(0.5, 0.6, 0.06, wood, 0, 0.5, -0.24));
		for (const [x, z] of [
			[-0.21, -0.21],
			[0.21, -0.21],
			[-0.21, 0.21],
			[0.21, 0.21]
		])
			c.add(kit.box(0.05, 0.44, 0.05, wood, x, 0, z));
		c.position.set(chair.x, 0.02, chair.z);
		c.scale.setScalar(PEOPLE_SCALE);
		c.rotation.y = Math.atan2(TABLE.x - chair.x, TABLE.z - chair.z);
		c.traverse((child) => (child.castShadow = true));
		furniture.add(c);
	}
	setPick(furniture, { kind: 'room', id: 'townhall' });
	outer.add(furniture);

	// the static parts in a few meshes; the core's moving parts stay apart
	mergeStatic(hall, kit, new Set([crystal, ...rings]));
	mergeStatic(furniture, kit);

	const hallLight = new PointLight(0xffd8a8, 6, 12, 1.6);
	hallLight.position.set(TABLE.x, 2.8, TABLE.z);
	outer.add(hallLight);

	let spin = 0.4;
	let opacity = 1;
	let clockRedraw = 0;
	return {
		group: outer,
		update(dt, ctx) {
			const busy = ctx.agentsBusy || voiceActive(ctx.t.voice);
			spin = damp(spin, busy ? 3.2 : 0.4, 2, dt);
			crystal.rotation.y += spin * dt;
			crystal.position.y = coreY + Math.sin(ctx.time * 1.4) * 0.08;
			rings.forEach((ring, i) => (ring.rotation.z += spin * dt * (i ? -0.8 : 1.1)));
			coreMat.emissiveIntensity = damp(coreMat.emissiveIntensity, busy ? 3 : 1.4 + ctx.glow, 3, dt);
			coreLight.intensity = coreMat.emissiveIntensity * 4;

			// see-through up close, on the Town Hall preset, in a meeting
			const near = Math.hypot(ctx.camera.x - b.x, ctx.camera.z - b.z) < 14 && ctx.camera.y < 14;
			opacity = damp(opacity, ctx.openTownHall || near ? 0.1 : 1, 5, dt);
			fade(opacity);

			const light = lightOf(ctx.t.ha[firstOf(ctx.bindings, 'townhall', 'light') ?? '']);
			const level = light ? 0.4 + light.level * 0.6 : 0.5 + ctx.glow * 0.5;
			hallLight.intensity = damp(hallLight.intensity, 2 + level * 8, 4, dt);
			if (light) hallLight.color.copy(light.color);
			for (const glass of house.glass) glass.emissiveIntensity = ctx.glow * level * 1.6;
			house.doorLamp.intensity = ctx.glow * 6;
			house.doorLampGlow.emissiveIntensity = ctx.glow * 3;
			clockLight.intensity = ctx.glow * 4;

			clockRedraw -= dt;
			if (clockRedraw <= 0) {
				clockRedraw = 1;
				const { ctx: c, width } = clock;
				const now = new Date();
				const r = width / 2;
				c.clearRect(0, 0, width, width);
				c.fillStyle = '#fbf3df';
				c.beginPath();
				c.arc(r, r, r - 6, 0, Math.PI * 2);
				c.fill();
				c.lineWidth = 12;
				c.strokeStyle = '#3b2a1a';
				c.stroke();
				c.fillStyle = '#3b2a1a';
				for (let h = 0; h < 12; h++) {
					const a = (h * Math.PI) / 6;
					c.beginPath();
					c.arc(
						r + Math.sin(a) * r * 0.78,
						r - Math.cos(a) * r * 0.78,
						h % 3 ? 4 : 8,
						0,
						Math.PI * 2
					);
					c.fill();
				}
				c.lineCap = 'round';
				c.strokeStyle = '#2a1d12';
				const hand = (angle: number, length: number, lineWidth: number) => {
					c.lineWidth = lineWidth;
					c.beginPath();
					c.moveTo(r, r);
					c.lineTo(r + Math.sin(angle) * length, r - Math.cos(angle) * length);
					c.stroke();
				};
				hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), r * 0.5, 12);
				hand(now.getMinutes() * (Math.PI / 30), r * 0.72, 8);
				clock.refresh();
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
