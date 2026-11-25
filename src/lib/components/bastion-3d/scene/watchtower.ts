/**
 * The watchtower (upper floor and outside, bastion-cams): an NVR desk with
 * radar-sweep monitors, the terrace deck with loungers, a lit pool (the
 * terrace's first bound light.* is the pool light), trees, and a PoE camera
 * on the house corner that sweeps and locks onto the side of a motion event.
 * The monitors and the PoE camera open the live stream of a bound camera.
 */
import { ConeGeometry, Group, Mesh, PointLight, SphereGeometry } from 'three';
import {
	FLOOR2,
	Kit,
	damp,
	hashAngle,
	lightOf,
	setPick,
	type CanvasScreen,
	type SceneModule
} from './common';
import { allOf, firstOf } from '$lib/bindings';
import type { CamEvent } from '$lib/types';

/** a motion this recent locks the PoE camera and alerts the Vision Sentinel */
export const MOTION_WINDOW = 20_000;

export function recentMotion(event: CamEvent | undefined, now = Date.now()) {
	return !!event && now - event.at < MOTION_WINDOW;
}

/** the side a camera's events come from: an angle around the house, -0.7 … 1.9 rad */
export function motionSide(camera: string) {
	return -0.7 + (hashAngle(camera) / (Math.PI * 2)) * 2.6;
}

function drawRadar(screen: CanvasScreen, angle: number, label: string, blip?: number) {
	const { ctx, width, height } = screen;
	const cx = width / 2;
	const cy = height / 2 + 10;
	const r = Math.min(width, height) / 2 - 24;
	ctx.fillStyle = '#020d08';
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
	ctx.lineWidth = 2;
	for (const k of [0.33, 0.66, 1]) {
		ctx.beginPath();
		ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
		ctx.stroke();
	}
	const gradient = ctx.createConicGradient(angle - 0.6, cx, cy);
	gradient.addColorStop(0, 'rgba(74,222,128,0)');
	gradient.addColorStop(0.09, 'rgba(74,222,128,0.55)');
	gradient.addColorStop(0.1, 'rgba(74,222,128,0)');
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	if (blip !== undefined) {
		ctx.fillStyle = '#f87171';
		ctx.beginPath();
		ctx.arc(cx + Math.cos(blip) * r * 0.6, cy + Math.sin(blip) * r * 0.6, 9, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = '#4ade80';
	ctx.font = '20px ui-monospace, monospace';
	ctx.fillText(label.slice(0, 22), 12, 26);
	screen.refresh();
}

export function buildWatchtower(): SceneModule {
	const kit = new Kit();
	const group = kit.group('watchtower');

	// NVR desk, three monitors (each opens a camera)
	const dark = kit.mat(0x0f172a, { metalness: 0.5, roughness: 0.4 });
	group.add(kit.box(2.6, 0.06, 0.8, kit.mat(0x1f2937), 3, FLOOR2 + 0.72, -4.2));
	group.add(kit.box(0.9, 0.7, 0.6, dark, 4.6, FLOOR2, -4.3));
	const nvrLed = kit.glow(0x22c55e, 2);
	group.add(kit.box(0.4, 0.04, 0.02, nvrLed, 4.6, FLOOR2 + 0.55, -3.99));
	const screens = [0, 1, 2].map((i) => {
		const screen = kit.canvas(256, 256);
		const x = 2.1 + i * 0.9;
		const bezel = kit.box(0.82, 0.62, 0.04, dark, x, FLOOR2 + 0.92, -4.45);
		group.add(bezel);
		const mesh = kit.screen(screen, 0.74, 0.54);
		mesh.position.set(x, FLOOR2 + 1.23, -4.42);
		setPick(mesh, { kind: 'camera', room: 'watchtower' });
		mesh.userData.cameraIndex = i;
		group.add(mesh);
		return screen;
	});

	// terrace deck
	const deckMat = kit.mat(0x8b6a4a, { roughness: 0.9 });
	for (let i = 0; i < 18; i++) {
		const plank = kit.box(16, 0.08, 0.46, deckMat, 2, 0, 6.3 + i * 0.5);
		setPick(plank, { kind: 'room', id: 'terrace' });
		group.add(plank);
	}

	// pool: a basin, water that glows with the pool light
	const basinMat = kit.mat(0xe2e8f0, { roughness: 0.6 });
	group.add(kit.box(7.4, 0.12, 0.3, basinMat, 2.5, 0.08, 7.9));
	group.add(kit.box(7.4, 0.12, 0.3, basinMat, 2.5, 0.08, 13.1));
	group.add(kit.box(0.3, 0.12, 5.5, basinMat, -1.2, 0.08, 10.5));
	group.add(kit.box(0.3, 0.12, 5.5, basinMat, 6.2, 0.08, 10.5));
	const waterMat = kit.mat(0x0e7490, {
		emissive: 0x06b6d4,
		emissiveIntensity: 0.2,
		transparent: true,
		opacity: 0.85,
		roughness: 0.05,
		metalness: 0.1
	});
	const water = kit.plane(7.1, 5, waterMat);
	water.rotation.x = -Math.PI / 2;
	water.position.set(2.5, 0.1, 10.5);
	setPick(water, { kind: 'room', id: 'terrace' });
	group.add(water);
	const poolLight = new PointLight(0x22d3ee, 0, 10, 1.5);
	poolLight.position.set(2.5, 0.6, 10.5);
	group.add(poolLight);

	// loungers
	const cushion = kit.mat(0xf1f5f9, { roughness: 1 });
	const frame = kit.mat(0x334155, { metalness: 0.6 });
	for (const x of [-4.5, -3, 8, 9.3]) {
		const lounger = new Group();
		lounger.add(kit.box(0.7, 0.3, 1.8, frame, 0, 0, 0));
		lounger.add(kit.box(0.66, 0.1, 1.2, cushion, 0, 0.3, 0.25));
		const back = kit.box(0.66, 0.1, 0.7, cushion, 0, 0.3, -0.6);
		back.rotation.x = -0.6;
		back.position.y = 0.55;
		lounger.add(back);
		lounger.position.set(x, 0.08, 10.5);
		group.add(lounger);
	}

	// trees
	const trunkMat = kit.mat(0x5b3a24);
	const leafMat = kit.mat(0x166534, { roughness: 1, flatShading: true });
	const coneGeo = kit.geo(new ConeGeometry(1.1, 2.6, 7));
	const blobGeo = kit.geo(new SphereGeometry(1.2, 7, 5));
	const treeSpots: [number, number, 'cone' | 'blob'][] = [
		[-9, 9, 'cone'],
		[-7.5, 14, 'blob'],
		[12, 12, 'cone'],
		[14.5, 6, 'blob'],
		[-13, 2, 'cone'],
		[15, -3, 'cone']
	];
	for (const [x, z, kind] of treeSpots) {
		const trunk = kit.cylinder(0.12, 0.16, 1.4, trunkMat, 6);
		trunk.position.set(x, 0.7, z);
		group.add(trunk);
		const crown = new Mesh(kind === 'cone' ? coneGeo : blobGeo, leafMat);
		crown.position.set(x, kind === 'cone' ? 2.6 : 2.4, z);
		group.add(crown);
	}

	// the PoE camera on the front-right corner of the house
	const mount = new Group();
	mount.position.set(6.1, FLOOR2 * 2 - 0.3, 5.1);
	const arm = kit.box(0.08, 0.08, 0.4, frame, 0, 0, 0.1);
	mount.add(arm);
	const head = new Group();
	head.position.set(0, -0.05, 0.35);
	const body = kit.box(0.18, 0.16, 0.42, kit.mat(0xf8fafc, { roughness: 0.4 }), 0, -0.08, 0.15);
	head.add(body);
	const lensMat = kit.glow(0x60a5fa, 1.5);
	const lens = kit.cylinder(0.05, 0.05, 0.04, lensMat, 12);
	lens.rotation.x = Math.PI / 2;
	lens.position.set(0, 0, 0.37);
	head.add(lens);
	mount.add(head);
	setPick(mount, { kind: 'camera', room: 'watchtower' });
	group.add(mount);

	let sweep = 0;
	let yaw = 0.6;
	let redraw = 0;
	return {
		group,
		update(dt, ctx) {
			const pool = lightOf(ctx.t.ha[firstOf(ctx.bindings, 'terrace', 'light') ?? '']);
			poolLight.intensity = damp(poolLight.intensity, pool ? pool.level * 14 : 0, 4, dt);
			if (pool) {
				poolLight.color.copy(pool.color);
				waterMat.emissive.copy(pool.color);
			}
			waterMat.emissiveIntensity = damp(
				waterMat.emissiveIntensity,
				pool ? 0.4 + pool.level + Math.sin(ctx.time * 2) * 0.08 : 0.12,
				4,
				dt
			);

			const motion = ctx.t.cams.lastMotion;
			const locked = recentMotion(motion);
			sweep += dt * 0.5;
			const target = locked ? motionSide(motion!.camera) : 0.6 + Math.sin(sweep) * 1.1;
			yaw = damp(yaw, target, locked ? 5 : 2, dt);
			head.rotation.y = yaw;
			head.rotation.x = locked ? 0.35 : 0.25;
			lensMat.color.setHex(locked ? 0xf87171 : 0x60a5fa);
			lensMat.emissive.setHex(locked ? 0xef4444 : 0x3b82f6);
			nvrLed.emissive.setHex(locked ? 0xef4444 : 0x22c55e);

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1 / 12;
				const cameras = allOf(ctx.bindings, 'watchtower', 'camera');
				screens.forEach((screen, i) => {
					const id = cameras[i];
					const name = id
						? String(ctx.t.ha[id]?.attributes.friendly_name ?? id.replace('camera.', ''))
						: 'no camera';
					const hit =
						locked && id && motion && id.includes(motion.camera)
							? motionSide(motion.camera)
							: undefined;
					drawRadar(screen, ctx.time * 2 + i * 2, name, hit);
				});
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
