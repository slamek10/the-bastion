/**
 * The boiler house (bastion-heat): a brick bathhouse with a chimney that
 * smokes and a vent that puffs steam while the heating runs, copper pipes on
 * its front going from cool blue to glowing orange, and a pressure-gauge sign
 * with the thermostat from the first climate.* bound to it.
 */
import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three';
import {
	glowOnly,
	Kit,
	damp,
	placeBuilding,
	setPick,
	type BuildAssets,
	type SceneModule
} from './common';
import { buildHouse, finishHouse, mergeStatic } from './buildingKit';
import { BUILDINGS } from '$lib/village/layout';
import { firstOf } from '$lib/bindings';

const COLD = new Color(0x7fa3c4);
const HOT = new Color(0xf97316);
const COPPER = new Color(0xb87333);

/** a puff column: particles rising from a point and spreading */
function puffs(kit: Kit, count: number, size: number, color: number) {
	const positions = new Float32Array(count * 3);
	const ages = new Float32Array(count).map((_, i) => i / count);
	const geometry = kit.geo(new BufferGeometry());
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	const material = kit.d.track(
		new PointsMaterial({ color, size, transparent: true, opacity: 0, depthWrite: false })
	);
	const points = new Points(geometry, material);
	points.frustumCulled = false;
	return {
		points,
		material,
		update(
			dt: number,
			from: [number, number, number],
			rise: number,
			spread: number,
			speed: number
		) {
			for (let i = 0; i < count; i++) {
				ages[i] = (ages[i] + dt * speed) % 1;
				const age = ages[i];
				positions[i * 3] = from[0] + Math.sin(age * 6 + i) * age * spread + age * spread;
				positions[i * 3 + 1] = from[1] + age * rise;
				positions[i * 3 + 2] = from[2] + Math.cos(age * 5 + i) * age * spread;
			}
			geometry.attributes.position.needsUpdate = true;
		}
	};
}

export function buildBoilerHouse({ kits }: BuildAssets): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.boiler;
	const { group, w, d } = placeBuilding(kit, b);

	const house = buildHouse(kits.village, kits.nature, kit, {
		w,
		d,
		style: 'brick',
		roof: 'Roof_RoundTiles_6x6',
		gable: 'Roof_Front_Brick6',
		chimney: [1.6, -1.2],
		windows: { front: true, back: false, sides: true },
		vines: true
	});
	finishHouse(house, kit);
	group.add(house.group);

	// smoke from the chimney, steam from a vent pipe on the side
	const chimneyTop: [number, number, number] = [1.6, house.height + 4, -1.2];
	const smoke = puffs(kit, 60, 0.9, 0xd8d4cc);
	group.add(smoke.points);
	const ventX = -w / 2 - 0.25;
	const vent = kit.cylinder(
		0.12,
		0.12,
		1.2,
		kit.mat(0x9c6a3c, { metalness: 0.8, roughness: 0.35 }),
		10
	);
	vent.position.set(ventX, house.height - 0.2, 1);
	group.add(vent);
	const steam = puffs(kit, 30, 0.5, 0xffffff);
	group.add(steam.points);

	// copper pipes on the front, either side of the door
	const pipeMat = kit.mat(0xb87333, { metalness: 0.85, roughness: 0.3, emissive: 0x000000 });
	for (const x of [-2.3, -1.6, 1.6, 2.3]) {
		const riser = kit.cylinder(0.07, 0.07, 2.4, pipeMat, 10);
		riser.position.set(x, 1.4, d / 2 + 0.2);
		riser.castShadow = true;
		group.add(riser);
	}
	for (const side of [-1, 1]) {
		const header = kit.cylinder(0.07, 0.07, 0.9, pipeMat, 10);
		header.rotation.z = Math.PI / 2;
		header.position.set(side * 1.95, 2.6, d / 2 + 0.2);
		group.add(header);
		const valve = kit.cylinder(0.12, 0.12, 0.06, kit.mat(0xb91c1c), 12);
		valve.rotation.x = Math.PI / 2;
		valve.position.set(side * 1.95, 1.2, d / 2 + 0.3);
		group.add(valve);
	}
	const glow = glowOnly(0xf97316);

	// the pressure-gauge sign by the door
	const sign = kit.canvas(320, 320);
	const signMesh = kit.screen(sign, 1, 1);
	signMesh.position.set(w / 2 + 0.5, 1.7, d / 2 + 0.6);
	group.add(signMesh);
	group.add(kit.box(0.1, 1.2, 0.1, kit.mat(0x6b4426), w / 2 + 0.5, 0, d / 2 + 0.55));
	// a woodpile by the side
	for (let i = 0; i < 9; i++) {
		const log = kit.cylinder(
			0.12,
			0.12,
			1,
			kits.village.material('MI_WoodTrim') ?? kit.mat(0x7a5233),
			8
		);
		log.rotation.x = Math.PI / 2;
		log.position.set(
			w / 2 + 0.4 + (i % 3) * 0.25 - (Math.floor(i / 3) % 2) * 0.12,
			0.12 + Math.floor(i / 3) * 0.22,
			-1
		);
		log.castShadow = true;
		group.add(log);
	}
	setPick(group, { kind: 'room', id: 'boiler' });

	mergeStatic(group, kit);

	let heat = 0;
	let redraw = 0;
	const color = new Color();
	return {
		group,
		update(dt, ctx) {
			const climateId = firstOf(ctx.bindings, 'boiler', 'climate');
			const climate = climateId ? ctx.t.ha[climateId] : undefined;
			const heating = ctx.t.heat.active || climate?.attributes.hvac_action === 'heating';
			heat = damp(heat, heating ? 1 : 0, 1.2, dt);
			color
				.copy(COPPER)
				.lerp(COLD, (1 - heat) * 0.5)
				.lerp(HOT, heat * 0.7);
			pipeMat.color.copy(color);
			pipeMat.emissive.copy(HOT).multiplyScalar(heat * 0.8);
			glow.intensity = heat * 8;
			smoke.material.opacity = heat * 0.5;
			steam.material.opacity = heat * 0.6;
			if (heat > 0.02) {
				smoke.update(dt, chimneyTop, 5, 0.8, 0.16);
				steam.update(dt, [ventX, house.height + 0.4, 1], 1.8, 0.3, 0.5);
			}
			for (const glass of house.glass) glass.emissiveIntensity = 0.15 + heat * 0.9 + ctx.glow * 1.1;
			house.doorLamp.intensity = ctx.glow * 6;
			house.doorLampGlow.emissiveIntensity = ctx.glow * 3;

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1;
				const { ctx: c, width } = sign;
				c.fillStyle = '#2b1d14';
				c.fillRect(0, 0, width, width);
				c.strokeStyle = '#b87333';
				c.lineWidth = 10;
				c.beginPath();
				c.arc(160, 165, 130, 0, Math.PI * 2);
				c.stroke();
				c.strokeStyle = heating ? '#f97316' : '#7fa3c4';
				c.lineWidth = 14;
				c.beginPath();
				c.arc(
					160,
					165,
					110,
					Math.PI * 0.75,
					Math.PI * 0.75 + Math.PI * 1.5 * (heating ? 0.8 : 0.4)
				);
				c.stroke();
				c.textAlign = 'center';
				c.fillStyle = '#fef3c7';
				const current = climate?.attributes.current_temperature;
				const target = climate?.attributes.temperature;
				c.font = '600 60px ui-sans-serif, system-ui';
				c.fillText(typeof current === 'number' ? `${current.toFixed(1)}°` : '--.-°', 160, 180);
				c.font = '22px ui-sans-serif, system-ui';
				c.fillStyle = '#d6c4a8';
				c.fillText(
					climate ? `target ${typeof target === 'number' ? target : '–'}°` : 'no climate bound',
					160,
					222
				);
				c.fillStyle = heating ? '#fb923c' : '#93c5fd';
				c.fillText(heating ? 'HEATING' : 'IDLE', 160, 256);
				c.textAlign = 'start';
				sign.refresh();
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
