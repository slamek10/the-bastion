/**
 * The vision tower (bastion-cams) by the pond: a stone watchtower whose
 * camera-lantern sweeps and locks toward the side of a motion event, a radar
 * board by the door, and the pond's lit swimming area (the pond's first
 * bound light.*). The tower, its lantern and the board open the cameras.
 */
import { Group, Mesh, PointLight, SphereGeometry } from 'three';
import {
	Kit,
	damp,
	hashAngle,
	lightOf,
	placeBuilding,
	setPick,
	type CanvasScreen,
	type SceneModule
} from './common';
import { BUILDINGS, SWIM } from '$lib/village/layout';
import { allOf, firstOf } from '$lib/bindings';
import type { CamEvent } from '$lib/types';

/** a motion this recent locks the lantern and sends the Vision Sentinel to its tower */
export const MOTION_WINDOW = 20_000;

export function recentMotion(event: CamEvent | undefined, now = Date.now()) {
	return !!event && now - event.at < MOTION_WINDOW;
}

/** the direction a camera's events come from, as a yaw around the tower */
export const motionSide = (camera: string) => hashAngle(camera);

function drawRadar(screen: CanvasScreen, angle: number, label: string, blip?: number) {
	const { ctx, width, height } = screen;
	const cx = width / 2;
	const cy = height / 2 + 10;
	const r = Math.min(width, height) / 2 - 24;
	ctx.fillStyle = '#04140c';
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
		ctx.arc(cx + Math.cos(blip) * r * 0.6, cy + Math.sin(blip) * r * 0.6, 10, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = '#4ade80';
	ctx.font = '20px ui-monospace, monospace';
	ctx.fillText(label.slice(0, 22), 12, 26);
	screen.refresh();
}

export function buildVisionTower(): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.tower;
	const { group, d } = placeBuilding(kit, b);
	const outer = kit.group('visionTower');
	outer.add(group);

	const stone = kit.mat(0x9b958a, { roughness: 1, flatShading: true });
	const body = kit.cylinder(1.7, 1.95, 8, stone, 10);
	body.position.y = 4;
	group.add(body);
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2;
		const merlon = kit.box(0.5, 0.6, 0.35, stone, Math.cos(a) * 1.75, 8, Math.sin(a) * 1.75);
		merlon.rotation.y = -a;
		group.add(merlon);
	}
	group.add(kit.box(1, 2, 0.1, kit.mat(0x5b3a24), 0, 0, 1.9));
	for (const y of [3.5, 6]) {
		const slit = kit.plane(
			0.3,
			0.9,
			kit.mat(0x1d2430, { emissive: 0xffc56b, emissiveIntensity: 0.3 })
		);
		slit.position.set(0, y, 1.92);
		group.add(slit);
	}
	group.traverse((child) => {
		if ((child as Mesh).isMesh) child.castShadow = true;
	});

	// the camera-lantern on top
	const head = new Group();
	head.position.set(0, 8.9, 0);
	const housing = kit.box(0.5, 0.45, 0.9, kit.mat(0xf8fafc, { roughness: 0.4 }), 0, -0.22, 0.1);
	head.add(housing);
	const lensMat = kit.glow(0x60a5fa, 1.8);
	const lens = kit.cylinder(0.14, 0.14, 0.06, lensMat, 16);
	lens.rotation.x = Math.PI / 2;
	lens.position.set(0, 0, 0.57);
	head.add(lens);
	const lanternLight = new PointLight(0x60a5fa, 3, 10, 1.6);
	lanternLight.position.set(0, 0, 0.8);
	head.add(lanternLight);
	group.add(head);
	group.add(kit.cylinder(0.08, 0.08, 0.6, kit.mat(0x2f3338), 8).translateY(8.4));
	setPick(head, { kind: 'camera', room: 'tower' });

	// the radar board by the door
	const radar = kit.canvas(256, 256);
	const board = kit.screen(radar, 1.1, 1.1);
	board.position.set(1.6, 1.7, d / 2 + 0.9);
	board.userData.cameraIndex = 0;
	group.add(board);
	group.add(kit.box(0.1, 1.15, 0.1, kit.mat(0x6b4426), 1.6, 0, d / 2 + 0.85));
	setPick(board, { kind: 'camera', room: 'tower' });
	setPick(body, { kind: 'camera', room: 'tower' });

	// the swimming area: a pale floor under the water, buoys, a light
	const swimMat = kit.mat(0x9fe6ff, {
		emissive: 0x22d3ee,
		emissiveIntensity: 0.1,
		transparent: true,
		opacity: 0.75
	});
	const swim = kit.plane(SWIM.w, SWIM.d, swimMat);
	swim.rotation.x = -Math.PI / 2;
	swim.position.set(SWIM.x, 0.045, SWIM.z);
	setPick(swim, { kind: 'room', id: 'pond' });
	outer.add(swim);
	const buoyMat = kit.mat(0xf97316);
	const buoyGeo = kit.geo(new SphereGeometry(0.12, 8, 6));
	for (let i = 0; i < 16; i++) {
		const k = i / 16;
		const perimeter = 2 * (SWIM.w + SWIM.d);
		let p = k * perimeter;
		let x = SWIM.x - SWIM.w / 2;
		let z = SWIM.z - SWIM.d / 2;
		// around the rectangle: north side, east, south, west
		if (p < SWIM.w) {
			x += p;
		} else if ((p -= SWIM.w) < SWIM.d) {
			x += SWIM.w;
			z += p;
		} else if ((p -= SWIM.d) < SWIM.w) {
			x += SWIM.w - p;
			z += SWIM.d;
		} else {
			z += SWIM.d - (p - SWIM.w);
		}
		const buoy = new Mesh(buoyGeo, buoyMat);
		buoy.position.set(x, 0.08, z);
		outer.add(buoy);
	}
	const poolLight = new PointLight(0x22d3ee, 0, 9, 1.5);
	poolLight.position.set(SWIM.x, 0.8, SWIM.z);
	outer.add(poolLight);

	let sweep = 0;
	let yaw = 0;
	let redraw = 0;
	return {
		group: outer,
		update(dt, ctx) {
			const pool = lightOf(ctx.t.ha[firstOf(ctx.bindings, 'pond', 'light') ?? '']);
			poolLight.intensity = damp(poolLight.intensity, pool ? pool.level * 14 : 0, 4, dt);
			if (pool) {
				poolLight.color.copy(pool.color);
				swimMat.emissive.copy(pool.color);
			}
			swimMat.emissiveIntensity = damp(
				swimMat.emissiveIntensity,
				pool ? 0.5 + pool.level + Math.sin(ctx.time * 2) * 0.08 : 0.08,
				4,
				dt
			);

			// the lantern sweeps, and locks toward the side a motion came from
			const motion = ctx.t.cams.lastMotion;
			const locked = recentMotion(motion);
			sweep += dt * 0.5;
			const target = locked ? motionSide(motion!.camera) - group.rotation.y : Math.sin(sweep) * 1.6;
			let delta = target - yaw;
			delta = Math.atan2(Math.sin(delta), Math.cos(delta));
			yaw += delta * Math.min(1, dt * (locked ? 5 : 2));
			head.rotation.y = yaw;
			head.rotation.x = locked ? 0.35 : 0.2;
			lensMat.color.setHex(locked ? 0xf87171 : 0x60a5fa);
			lensMat.emissive.setHex(locked ? 0xef4444 : 0x3b82f6);
			lanternLight.color.setHex(locked ? 0xef4444 : 0x60a5fa);
			lanternLight.intensity = 2 + (1 - ctx.day) * 4;

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1 / 12;
				const cameras = allOf(ctx.bindings, 'tower', 'camera');
				const id = cameras[0];
				const name = id
					? String(ctx.t.ha[id]?.attributes.friendly_name ?? id.replace('camera.', ''))
					: 'no camera bound';
				drawRadar(
					radar,
					ctx.time * 2,
					locked && motion ? `${motion.label} · ${motion.camera}` : name,
					locked && motion ? motionSide(motion.camera) : undefined
				);
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
