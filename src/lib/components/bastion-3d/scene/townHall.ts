/**
 * The town hall (Orchestrator's home, bastion-ai): a hall with a round
 * meeting table and six chairs, a clock tower whose top holds the AI core
 * (a crystal in a glass dome that spins faster while an agent turn runs or
 * the voice assistant speaks). Its roof and front wall fade out when the
 * camera comes close or on the Town Hall preset, so the table shows.
 */
import {
	Mesh,
	OctahedronGeometry,
	PointLight,
	SphereGeometry,
	TorusGeometry,
	type MeshStandardMaterial
} from 'three';
import {
	Kit,
	damp,
	hipRoof,
	lightOf,
	placeBuilding,
	setPick,
	walls,
	type SceneModule
} from './common';
import { BUILDINGS, CHAIRS, TABLE } from '$lib/village/layout';
import { firstOf } from '$lib/bindings';
import { voiceActive } from '$lib/telemetry';

const H = 3.6;

export function buildTownHall(): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.townhall;
	const { group: hall, w, d } = placeBuilding(kit, b);
	const outer = kit.group('townHall');
	outer.add(hall);

	const plaster = kit.mat(0xf3e6cf, { roughness: 0.9 });
	const timber = kit.mat(0x6b4426, { roughness: 0.8 });
	// the parts that fade: their own transparent materials
	const fadeWall = kit.mat(0xf3e6cf, { roughness: 0.9, transparent: true });
	const fadeRoof = kit.mat(0xa44a3f, { roughness: 0.8, transparent: true, flatShading: true });
	const fading: MeshStandardMaterial[] = [fadeWall, fadeRoof];

	const floor = kit.box(w, 0.12, d, kit.mat(0x9b7653, { roughness: 0.8 }), 0, 0, 0);
	floor.receiveShadow = true;
	hall.add(floor);
	const { group: wallGroup, front } = walls(kit, w, d, H, plaster, 2);
	for (const piece of front) piece.material = fadeWall;
	hall.add(wallGroup);
	// timber framing on the corners
	for (const [x, z] of [
		[-w / 2, -d / 2],
		[w / 2, -d / 2],
		[-w / 2, d / 2],
		[w / 2, d / 2]
	])
		hall.add(kit.box(0.35, H, 0.35, timber, x, 0, z));
	const roof = hipRoof(kit, w, d, 2.6, fadeRoof, H);
	hall.add(roof);
	// steps and a sign over the door
	hall.add(kit.box(3, 0.2, 1, kit.mat(0xb9b2a6), 0, 0, d / 2 + 0.5));
	setPick(hall, { kind: 'room', id: 'townhall' });

	// the clock tower at the back
	const tower = kit.group('clockTower');
	tower.add(kit.box(3, 9, 3, plaster, 0, 0, 0));
	for (const y of [3, 6, 9]) tower.add(kit.box(3.2, 0.25, 3.2, timber, 0, y - 0.1, 0));
	const clock = kit.canvas(256, 256);
	const face = kit.screen(clock, 1.6, 1.6);
	face.position.set(0, 7.4, 1.52);
	tower.add(face);
	tower.position.set(0, 0, -d / 2 + 1.5);
	tower.traverse((child) => (child.castShadow = true));
	setPick(tower, { kind: 'room', id: 'townhall' });
	hall.add(tower);

	// the AI core on top: a crystal and rings in a glass dome
	const coreMat = kit.mat(0xa78bfa, {
		emissive: 0x7c3aed,
		emissiveIntensity: 1.6,
		flatShading: true,
		roughness: 0.2
	});
	const crystal = new Mesh(kit.geo(new OctahedronGeometry(0.6, 0)), coreMat);
	crystal.position.set(0, 10.2, -d / 2 + 1.5);
	hall.add(crystal);
	const ringMats = [kit.glow(0x38bdf8, 1.6), kit.glow(0xf472b6, 1.4)];
	const rings = ringMats.map((material, i) => {
		const ring = new Mesh(kit.geo(new TorusGeometry(0.95 + i * 0.2, 0.03, 8, 48)), material);
		ring.position.copy(crystal.position);
		ring.rotation.x = Math.PI / 2 + i * 0.6;
		hall.add(ring);
		return ring;
	});
	const dome = new Mesh(
		kit.geo(new SphereGeometry(1.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
		kit.mat(0xd6ecff, { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 })
	);
	dome.position.set(0, 9, -d / 2 + 1.5);
	hall.add(dome);
	const coreLight = new PointLight(0x8b5cf6, 8, 14, 1.6);
	coreLight.position.copy(crystal.position);
	hall.add(coreLight);
	setPick(crystal, { kind: 'room', id: 'townhall' });

	// the meeting table and chairs, in village coordinates
	const furniture = kit.group('meeting');
	const table = kit.cylinder(TABLE.r, TABLE.r, 0.08, kit.mat(0x8a5a35), 32);
	table.position.set(TABLE.x, 0.78, TABLE.z);
	table.castShadow = true;
	furniture.add(table);
	const leg = kit.cylinder(0.15, 0.3, 0.75, timber, 10);
	leg.position.set(TABLE.x, 0.37, TABLE.z);
	furniture.add(leg);
	const chairWood = kit.mat(0x7a4b2a);
	for (const chair of CHAIRS) {
		const c = kit.group('chair');
		c.add(kit.box(0.5, 0.06, 0.5, chairWood, 0, 0.44, 0));
		c.add(kit.box(0.5, 0.55, 0.06, chairWood, 0, 0.5, -0.24));
		for (const [x, z] of [
			[-0.21, -0.21],
			[0.21, -0.21],
			[-0.21, 0.21],
			[0.21, 0.21]
		])
			c.add(kit.box(0.05, 0.44, 0.05, chairWood, x, 0, z));
		c.position.set(chair.x, 0, chair.z);
		// its back away from the table: it faces the table's centre
		c.rotation.y = Math.atan2(TABLE.x - chair.x, TABLE.z - chair.z);
		c.traverse((child) => (child.castShadow = true));
		furniture.add(c);
	}
	setPick(furniture, { kind: 'room', id: 'townhall' });
	outer.add(furniture);

	const hallLight = new PointLight(0xffd8a8, 6, 12, 1.6);
	hallLight.position.set(TABLE.x, 3, TABLE.z);
	outer.add(hallLight);

	let spin = 0.4;
	let fade = 1;
	let clockRedraw = 0;
	return {
		group: outer,
		update(dt, ctx) {
			const busy = ctx.agentsBusy || voiceActive(ctx.t.voice);
			spin = damp(spin, busy ? 3.2 : 0.4, 2, dt);
			crystal.rotation.y += spin * dt;
			crystal.position.y = 10.2 + Math.sin(ctx.time * 1.4) * 0.08;
			rings.forEach((ring, i) => (ring.rotation.z += spin * dt * (i ? -0.8 : 1.1)));
			coreMat.emissiveIntensity = damp(coreMat.emissiveIntensity, busy ? 2.8 : 1.4, 3, dt);
			coreLight.intensity = coreMat.emissiveIntensity * 4;

			// the roof and front go see-through up close, or when asked to
			const near = Math.hypot(ctx.camera.x - b.x, ctx.camera.z - b.z) < 16 && ctx.camera.y < 16;
			fade = damp(fade, ctx.openTownHall || near ? 0.08 : 1, 5, dt);
			for (const material of fading) {
				material.opacity = fade;
				material.depthWrite = fade > 0.9;
			}
			roof.visible = fade > 0.02;

			const light = lightOf(ctx.t.ha[firstOf(ctx.bindings, 'townhall', 'light') ?? '']);
			hallLight.intensity = damp(
				hallLight.intensity,
				light ? 4 + light.level * 8 : 6 - ctx.day * 3,
				4,
				dt
			);
			if (light) hallLight.color.copy(light.color);

			clockRedraw -= dt;
			if (clockRedraw <= 0) {
				clockRedraw = 1;
				const { ctx: c, width } = clock;
				const now = new Date();
				const r = width / 2;
				c.fillStyle = '#f8f1e0';
				c.beginPath();
				c.arc(r, r, r - 4, 0, Math.PI * 2);
				c.fill();
				c.lineWidth = 10;
				c.strokeStyle = '#3b2a1a';
				c.stroke();
				c.lineCap = 'round';
				const hand = (angle: number, length: number, width: number) => {
					c.lineWidth = width;
					c.beginPath();
					c.moveTo(r, r);
					c.lineTo(r + Math.sin(angle) * length, r - Math.cos(angle) * length);
					c.stroke();
				};
				hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), r * 0.5, 12);
				hand(now.getMinutes() * (Math.PI / 30), r * 0.78, 8);
				clock.refresh();
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
