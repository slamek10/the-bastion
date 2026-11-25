/**
 * Shared pieces for the scene builders: what update() gets each frame, what
 * a builder returns, and a small kit of tracked primitives so everything a
 * builder makes is disposed with it.
 */
import {
	BoxGeometry,
	ConeGeometry,
	CanvasTexture,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	SRGBColorSpace,
	type BufferGeometry,
	type Material,
	type MeshBasicMaterialParameters,
	type MeshStandardMaterialParameters,
	type Object3D
} from 'three';
import { Disposer } from '../disposer';
import type { AgentId, Bindings, HaEntity, RoomId, Telemetry } from '$lib/types';

export interface FrameContext {
	t: Telemetry;
	bindings: Bindings;
	/** seconds since the scene started */
	time: number;
	/** 0 night … 1 day, eased */
	day: number;
	/** lamps, windows, the core: 0 off (day) … 1 fully lit (night), eased */
	glow: number;
	/** any agent turn runs */
	agentsBusy: boolean;
	/** where the camera is, for the town hall's fading roof */
	camera: { x: number; y: number; z: number };
	/** the town hall's roof and front fade out (Town Hall preset, a meeting) */
	openTownHall: boolean;
}

export type Pick =
	{ kind: 'room'; id: RoomId } | { kind: 'agent'; id: AgentId } | { kind: 'camera'; room: RoomId };

/** what every builder gets: the kits, the quality, and shared materials */
export interface BuildAssets {
	kits: import('./kits').Kits;
	quality: import('$lib/village/lighting').QualitySettings;
}

export interface SceneModule {
	group: Group;
	update: (dt: number, ctx: FrameContext) => void;
	dispose: () => void;
}

export function setPick(object: Object3D, pick: Pick) {
	object.traverse((child) => (child.userData.pick = pick));
	return object;
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** frame-rate independent smoothing toward a target */
export const damp = (current: number, target: number, rate: number, dt: number) =>
	lerp(current, target, 1 - Math.exp(-rate * dt));

/** an HA light's colour and brightness (0-1), or undefined when off/unknown */
export function lightOf(entity: HaEntity | undefined): { color: Color; level: number } | undefined {
	if (!entity || entity.state !== 'on') return undefined;
	const rgb = entity.attributes.rgb_color as number[] | undefined;
	const brightness = entity.attributes.brightness as number | undefined;
	const color = Array.isArray(rgb)
		? new Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
		: new Color(1, 0.86, 0.7);
	return { color, level: typeof brightness === 'number' ? brightness / 255 : 1 };
}

export function hashAngle(text: string) {
	let h = 0;
	for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
	return ((h >>> 0) % 360) * (Math.PI / 180);
}

/** a canvas drawn into a texture, redrawn on demand */
export interface CanvasScreen {
	texture: CanvasTexture;
	ctx: CanvasRenderingContext2D;
	width: number;
	height: number;
	refresh: () => void;
}

export class Kit {
	readonly d = new Disposer();
	private boxes = new Map<string, BoxGeometry>();

	mat(color: number | string, options: MeshStandardMaterialParameters = {}) {
		return this.d.track(
			new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...options })
		);
	}

	glow(color: number | string, intensity = 1.5) {
		return this.mat(color, {
			emissive: new Color(color),
			emissiveIntensity: intensity,
			roughness: 0.4
		});
	}

	basic(color: number | string, options: MeshBasicMaterialParameters = {}) {
		return this.d.track(new MeshBasicMaterial({ color, ...options }));
	}

	geo<T extends BufferGeometry>(geometry: T) {
		return this.d.track(geometry);
	}

	boxGeo(w: number, h: number, depth: number) {
		const key = `${w}|${h}|${depth}`;
		let geometry = this.boxes.get(key);
		if (!geometry) {
			geometry = this.d.track(new BoxGeometry(w, h, depth));
			this.boxes.set(key, geometry);
		}
		return geometry;
	}

	/** a box standing on y (its bottom at y), centred on x/z */
	box(w: number, h: number, depth: number, material: Material, x = 0, y = 0, z = 0) {
		const mesh = new Mesh(this.boxGeo(w, h, depth), material);
		mesh.position.set(x, y + h / 2, z);
		return mesh;
	}

	cylinder(rTop: number, rBottom: number, h: number, material: Material, segments = 16) {
		return new Mesh(this.geo(new CylinderGeometry(rTop, rBottom, h, segments)), material);
	}

	plane(w: number, h: number, material: Material) {
		return new Mesh(this.geo(new PlaneGeometry(w, h)), material);
	}

	canvas(width: number, height: number): CanvasScreen {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d')!;
		const texture = this.d.track(new CanvasTexture(canvas));
		texture.colorSpace = SRGBColorSpace;
		return { texture, ctx, width, height, refresh: () => (texture.needsUpdate = true) };
	}

	/** a screen mesh showing a canvas, glowing */
	screen(screen: CanvasScreen, w: number, h: number) {
		const material = this.basic(0xffffff, { map: screen.texture, toneMapped: false });
		return this.plane(w, h, material);
	}

	group(name: string) {
		const group = new Group();
		group.name = name;
		return group;
	}

	dispose() {
		this.d.dispose();
		this.boxes.clear();
	}
}

/** a mono status line on a canvas screen */
export function drawLines(
	screen: CanvasScreen,
	lines: { text: string; color?: string }[],
	options: { title?: string; background?: string; size?: number } = {}
) {
	const { ctx, width, height } = screen;
	const size = options.size ?? 22;
	ctx.fillStyle = options.background ?? '#06101f';
	ctx.fillRect(0, 0, width, height);
	let y = 14;
	if (options.title) {
		ctx.fillStyle = '#7dd3fc';
		ctx.font = `600 ${size + 4}px ui-monospace, monospace`;
		ctx.fillText(options.title, 16, y + size);
		y += size + 18;
	}
	ctx.font = `${size}px ui-monospace, monospace`;
	for (const line of lines) {
		if (y + size > height - 6) break;
		ctx.fillStyle = line.color ?? '#cbd5e1';
		ctx.fillText(line.text, 16, y + size);
		y += size + 8;
	}
	screen.refresh();
}

/* ------------------------------------------------------------ buildings */

const FACING_ROTATION = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 } as const;

/**
 * A building's group, placed and turned so that its local +z side is the
 * front (the door side). Returns the group and its local width (along x)
 * and depth (along z).
 */
export function placeBuilding(
	kit: Kit,
	b: {
		id: string;
		x: number;
		z: number;
		w: number;
		d: number;
		facing: keyof typeof FACING_ROTATION;
	}
) {
	const group = kit.group(b.id);
	group.position.set(b.x, 0, b.z);
	group.rotation.y = FACING_ROTATION[b.facing];
	const sideways = b.facing === 'e' || b.facing === 'w';
	return { group, w: sideways ? b.d : b.w, d: sideways ? b.w : b.d };
}

/** a hip roof: a four-sided pyramid over w × d, h tall, its base at y */
export function hipRoof(kit: Kit, w: number, d: number, h: number, material: Material, y: number) {
	const roof = new Mesh(kit.geo(new ConeGeometry(Math.SQRT1_2, 1, 4, 1)), material);
	roof.rotation.y = Math.PI / 4;
	// the cone's base is a square of side 1 after the turn; stretch it over the walls with an overhang
	const outer = new Group();
	outer.add(roof);
	outer.scale.set(w + 0.8, h, d + 0.8);
	outer.position.y = y + h / 2;
	roof.castShadow = true;
	return outer;
}

/**
 * Four walls of w × d × h (front at +z) with a door gap in the front, and
 * window holes are left to the caller (it adds glass on top). Returns the
 * walls group and its front wall pieces (the town hall fades those).
 */
export function walls(kit: Kit, w: number, d: number, h: number, material: Material, door = 1.4) {
	const group = new Group();
	const t = 0.3;
	const back = kit.box(w, h, t, material, 0, 0, -d / 2 + t / 2);
	const left = kit.box(t, h, d, material, -w / 2 + t / 2, 0, 0);
	const right = kit.box(t, h, d, material, w / 2 - t / 2, 0, 0);
	const side = (w - door) / 2;
	const frontL = kit.box(side, h, t, material, -w / 2 + side / 2, 0, d / 2 - t / 2);
	const frontR = kit.box(side, h, t, material, w / 2 - side / 2, 0, d / 2 - t / 2);
	const lintel = kit.box(door, h - 2.2, t, material, 0, 2.2, d / 2 - t / 2);
	const front = [frontL, frontR, lintel];
	for (const mesh of [back, left, right, ...front]) {
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add(mesh);
	}
	return { group, front };
}

/**
 * Stands in for a point light where a glow is enough (windows, door lamps):
 * every real light costs every lit pixel of the village, so only a few are
 * real (the lamps near the camera, the hall, the core, the lantern, the pool,
 * the alarm strobe). Same fields, nothing drawn.
 */
export function glowOnly(color = 0xffffff) {
	return { intensity: 0, color: new Color(color), position: { set: (..._xyz: number[]) => {} } };
}
