/**
 * Shared pieces for the scene builders: what update() gets each frame, what
 * a builder returns, and a small kit of tracked primitives so everything a
 * builder makes is disposed with it.
 */
import {
	BoxGeometry,
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
	/** 0 twilight … 1 day, eased */
	day: number;
	/** any agent turn runs */
	agentsBusy: boolean;
}

export type Pick =
	{ kind: 'room'; id: RoomId } | { kind: 'agent'; id: AgentId } | { kind: 'camera'; room: RoomId };

export interface SceneModule {
	group: Group;
	update: (dt: number, ctx: FrameContext) => void;
	dispose: () => void;
}

/** room boxes, metres: x/z extent and the floor's height */
export interface RoomBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	y: number;
}

export const FLOOR2 = 3.2;

export const ROOMS: Record<RoomId, RoomBounds> = {
	utility: { minX: -10, maxX: -4, minZ: -5, maxZ: 5, y: 0 },
	living: { minX: -4, maxX: 6, minZ: -5, maxZ: 5, y: 0 },
	bunker: { minX: 6, maxX: 13, minZ: -5, maxZ: 3, y: 0 },
	studio: { minX: -10, maxX: 0, minZ: -5, maxZ: 5, y: FLOOR2 },
	watchtower: { minX: 0, maxX: 6, minZ: -5, maxZ: 5, y: FLOOR2 },
	terrace: { minX: -6, maxX: 10, minZ: 6, maxZ: 15, y: 0 }
};

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
