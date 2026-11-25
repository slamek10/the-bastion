/**
 * Procedural textures and materials the kits don't have: grass with colour
 * variation, dirt paths with soft edges, water (fresnel tint and moving
 * ripples), a soft glow sprite for lamps and windows, and a contact shadow
 * blob for people and props. Made once per 3D view and tracked.
 */
import {
	AdditiveBlending,
	CanvasTexture,
	Color,
	MeshStandardMaterial,
	RepeatWrapping,
	SRGBColorSpace,
	SpriteMaterial,
	MeshBasicMaterial,
	type Texture
} from 'three';
import type { Disposer } from '../disposer';

function canvas(size: number) {
	const element = document.createElement('canvas');
	element.width = size;
	element.height = size;
	return { element, ctx: element.getContext('2d')! };
}

/** a seeded random, so textures look the same every time */
function seeded(seed: number) {
	return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** smooth value noise in a size × size tile, `cells` blobs across */
function noise(size: number, cells: number, seed: number) {
	const random = seeded(seed);
	const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => random());
	const at = (x: number, y: number) => grid[(y % cells) * (cells + 1) + (x % cells)];
	const out = new Float32Array(size * size);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const fx = (x / size) * cells;
			const fy = (y / size) * cells;
			const ix = Math.floor(fx);
			const iy = Math.floor(fy);
			const tx = fx - ix;
			const ty = fy - iy;
			const sx = tx * tx * (3 - 2 * tx);
			const sy = ty * ty * (3 - 2 * ty);
			const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
			const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
			out[y * size + x] = a + (b - a) * sy;
		}
	return out;
}

function texture(d: Disposer, element: HTMLCanvasElement, repeat = 1, color = true): Texture {
	const t = d.track(new CanvasTexture(element));
	if (color) t.colorSpace = SRGBColorSpace;
	t.wrapS = t.wrapT = RepeatWrapping;
	t.repeat.set(repeat, repeat);
	t.anisotropy = 4;
	return t;
}

/** grass: two noise scales of greens and a few dry patches */
export function grassMaterial(d: Disposer, repeat: number) {
	const size = 256;
	const big = noise(size, 4, 7);
	const small = noise(size, 32, 11);
	const { element, ctx } = canvas(size);
	const image = ctx.createImageData(size, size);
	const deep = new Color(0x4f7d32);
	const light = new Color(0x8db25a);
	const dry = new Color(0xb7a463);
	const c = new Color();
	for (let i = 0; i < size * size; i++) {
		c.copy(deep).lerp(light, big[i] * 0.7 + small[i] * 0.3);
		if (big[i] > 0.78) c.lerp(dry, (big[i] - 0.78) * 2.2);
		image.data[i * 4] = c.r * 255;
		image.data[i * 4 + 1] = c.g * 255;
		image.data[i * 4 + 2] = c.b * 255;
		image.data[i * 4 + 3] = 255;
	}
	ctx.putImageData(image, 0, 0);
	return d.track(new MeshStandardMaterial({ map: texture(d, element, repeat), roughness: 1 }));
}

/** a dirt path strip: packed earth with soft, ragged edges across its width (u) */
export function pathMaterial(d: Disposer) {
	const size = 128;
	const grain = noise(size, 16, 5);
	const { element, ctx } = canvas(size);
	const image = ctx.createImageData(size, size);
	const earth = new Color(0xcdb48c);
	const dark = new Color(0xa88b62);
	const c = new Color();
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const i = y * size + x;
			c.copy(earth).lerp(dark, grain[i] * 0.6);
			const edge = Math.min(x, size - 1 - x) / (size * 0.22);
			const alpha = Math.max(0, Math.min(1, edge + (grain[i] - 0.5) * 0.6));
			image.data[i * 4] = c.r * 255;
			image.data[i * 4 + 1] = c.g * 255;
			image.data[i * 4 + 2] = c.b * 255;
			image.data[i * 4 + 3] = alpha * 255;
		}
	ctx.putImageData(image, 0, 0);
	const map = texture(d, element, 1);
	map.wrapS = map.wrapT = RepeatWrapping;
	return d.track(
		new MeshStandardMaterial({
			map,
			transparent: true,
			depthWrite: false,
			roughness: 1,
			polygonOffset: true,
			polygonOffsetFactor: -2
		})
	);
}

/** a round soft blob: the path's joints, contact shadows and glows use it */
function radial(d: Disposer, inner: string, outer: string) {
	const { element, ctx } = canvas(64);
	const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	gradient.addColorStop(0, inner);
	gradient.addColorStop(1, outer);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);
	return texture(d, element, 1);
}

export function contactShadowMaterial(d: Disposer) {
	return d.track(
		new MeshBasicMaterial({
			map: radial(d, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'),
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -4
		})
	);
}

/** a warm halo for lamps and windows at night; scale its opacity with the glow */
export function glowMaterial(d: Disposer, color = 0xffc46b) {
	return d.track(
		new SpriteMaterial({
			map: radial(d, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
			color,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			opacity: 0
		})
	);
}

/** a joint where paths meet: the same earth, round */
export function pathJointMaterial(d: Disposer) {
	const { element, ctx } = canvas(64);
	const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	gradient.addColorStop(0, 'rgba(205,180,140,1)');
	gradient.addColorStop(0.6, 'rgba(195,168,128,0.85)');
	gradient.addColorStop(1, 'rgba(195,168,128,0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);
	return d.track(
		new MeshStandardMaterial({
			map: texture(d, element, 1),
			transparent: true,
			depthWrite: false,
			roughness: 1,
			polygonOffset: true,
			polygonOffsetFactor: -2
		})
	);
}

/** a tangent-space ripple normal map from noise */
function rippleNormals(d: Disposer) {
	const size = 128;
	const h = noise(size, 12, 3);
	const h2 = noise(size, 28, 9);
	const { element, ctx } = canvas(size);
	const image = ctx.createImageData(size, size);
	const height = (x: number, y: number) => {
		const i = ((y + size) % size) * size + ((x + size) % size);
		return h[i] * 0.7 + h2[i] * 0.3;
	};
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const dx = (height(x + 1, y) - height(x - 1, y)) * 4;
			const dy = (height(x, y + 1) - height(x, y - 1)) * 4;
			const length = Math.hypot(dx, dy, 1);
			const i = (y * size + x) * 4;
			image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
			image.data[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
			image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
			image.data[i + 3] = 255;
		}
	ctx.putImageData(image, 0, 0);
	return texture(d, element, 4, false);
}

/**
 * Water: a deep colour, a lighter tint at grazing angles (fresnel) and
 * ripples that drift (move `update(time)` each frame).
 */
export function waterMaterial(d: Disposer, deep = 0x2f7fa8, shallow = 0xa8e0ee) {
	const normalMap = rippleNormals(d);
	const material = d.track(
		new MeshStandardMaterial({
			color: deep,
			roughness: 0.12,
			metalness: 0.05,
			normalMap,
			transparent: true,
			opacity: 0.9
		})
	);
	const uniforms = { uShallow: { value: new Color(shallow) }, uFresnel: { value: 0.85 } };
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\nuniform vec3 uShallow;\nuniform float uFresnel;'
			)
			.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
				{
					float facing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
					totalEmissiveRadiance += uShallow * pow(1.0 - facing, 3.0) * uFresnel * 0.6;
				}`
			);
	};
	material.customProgramCacheKey = () => 'bastion-water';
	return {
		material,
		update(time: number) {
			normalMap.offset.set(time * 0.012, time * 0.008);
		}
	};
}
