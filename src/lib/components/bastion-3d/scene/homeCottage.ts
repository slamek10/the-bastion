/**
 * The home cottage (bastion-ha): its windows glow with the bound light.*
 * entities (on, brightness, colour), roller shutters over them follow the
 * bound cover.* positions, and a weathervane antenna on the roof pulses for
 * Zigbee/Thread while Home Assistant answers.
 */
import { Color, Mesh, PointLight, SphereGeometry, TorusGeometry } from 'three';
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
import { BUILDINGS } from '$lib/village/layout';
import { allOf } from '$lib/bindings';

const H = 3;
const WIN_W = 1.2;
const WIN_H = 1.1;
const WIN_Y = 1.1;
const DARK = new Color(0x26303d);

export function buildHomeCottage(): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.cottage;
	const { group, w, d } = placeBuilding(kit, b);

	const plaster = kit.mat(0xf6efe0, { roughness: 0.95 });
	const floor = kit.box(w, 0.1, d, kit.mat(0x9b7653), 0, -0.06, 0);
	floor.receiveShadow = true;
	group.add(floor);
	group.add(walls(kit, w, d, H, plaster, 1.3).group);
	group.add(hipRoof(kit, w, d, 2.4, kit.mat(0x4c6e8a, { flatShading: true }), H));
	const trim = kit.mat(0x6b4426);
	group.add(kit.box(1.5, 2.3, 0.08, trim, 0, 0, d / 2 + 0.02));

	// windows: two in front, one on each side; each a glow and a shutter above it
	const spots: { x: number; z: number; rot: number }[] = [
		{ x: -2.4, z: d / 2 + 0.02, rot: 0 },
		{ x: 2.4, z: d / 2 + 0.02, rot: 0 },
		{ x: -w / 2 - 0.02, z: 0.5, rot: -Math.PI / 2 },
		{ x: w / 2 + 0.02, z: 0.5, rot: Math.PI / 2 }
	];
	const shutterMat = kit.mat(0x9aa3ad, { metalness: 0.4, roughness: 0.6 });
	const windows = spots.map((spot) => {
		const material = kit.mat(0x26303d, {
			emissive: 0x000000,
			emissiveIntensity: 1,
			roughness: 0.3
		});
		const pane = kit.plane(WIN_W, WIN_H, material);
		pane.position.set(spot.x, WIN_Y + WIN_H / 2, spot.z);
		pane.rotation.y = spot.rot;
		group.add(pane);
		const frame = kit.box(WIN_W + 0.2, 0.12, 0.15, trim, spot.x, WIN_Y + WIN_H, spot.z);
		frame.rotation.y = spot.rot;
		group.add(frame);
		const shutter = kit.box(WIN_W, 1, 0.05, shutterMat, 0, 0, 0);
		shutter.rotation.y = spot.rot;
		const out = 0.05;
		shutter.position.set(
			spot.x + Math.sin(spot.rot) * out,
			WIN_Y + WIN_H,
			spot.z + Math.cos(spot.rot) * out
		);
		group.add(shutter);
		const light = new PointLight(0xffd8a8, 0, 6, 1.8);
		light.position.set(
			spot.x - Math.sin(spot.rot) * 1.2,
			WIN_Y + 0.6,
			spot.z - Math.cos(spot.rot) * 1.2
		);
		group.add(light);
		return { material, shutter, light, open: 1 };
	});

	// the weathervane antenna
	const mastMat = kit.mat(0x3b3f45, { metalness: 0.7 });
	const mast = kit.cylinder(0.04, 0.05, 1.6, mastMat, 8);
	mast.position.set(0, H + 2.4 + 0.6, 0);
	group.add(mast);
	const vane = kit.box(0.9, 0.05, 0.12, kit.mat(0xb08d57, { metalness: 0.7 }), 0, H + 3.2, 0);
	group.add(vane);
	const tipMat = kit.glow(0x22d3ee, 2);
	const tip = new Mesh(kit.geo(new SphereGeometry(0.1, 12, 10)), tipMat);
	tip.position.set(0, H + 3.85, 0);
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
	group.traverse((child) => {
		if ((child as Mesh).isMesh) child.castShadow = true;
	});
	setPick(group, { kind: 'room', id: 'cottage' });

	return {
		group,
		update(dt, ctx) {
			const lights = allOf(ctx.bindings, 'cottage', 'light');
			const covers = allOf(ctx.bindings, 'cottage', 'cover');
			windows.forEach((win, i) => {
				const id = lights.length ? lights[i % lights.length] : undefined;
				const state = lightOf(id ? ctx.t.ha[id] : undefined);
				const level = state?.level ?? 0;
				win.material.emissive.copy(state?.color ?? DARK);
				win.material.emissiveIntensity = damp(
					win.material.emissiveIntensity,
					state ? 0.6 + level * 1.8 : 0.05,
					6,
					dt
				);
				if (state) win.light.color.copy(state.color);
				win.light.intensity = damp(win.light.intensity, level * 5, 6, dt);

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
				win.shutter.position.y = WIN_Y + WIN_H - height / 2;
			});

			const rate = ctx.t.peers.hass === 'ok' ? 1.2 : 0.3;
			vane.rotation.y = Math.sin(ctx.time * 0.3) * 1.2;
			tipMat.emissiveIntensity = 1.2 + Math.sin(ctx.time * 5 * rate) * 0.8;
			pulses.forEach(({ ring, material }, i) => {
				const phase = (ctx.time * rate + i / 3) % 1;
				ring.scale.setScalar(1 + phase * 4);
				material.opacity = (1 - phase) * 0.7;
			});
		},
		dispose() {
			kit.dispose();
		}
	};
}
