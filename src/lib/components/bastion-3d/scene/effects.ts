/**
 * The picture after the scene is drawn: on High, a gentle bloom (windows,
 * lamps, the core, the fountain glow) and SMAA; on Low, the plain render with
 * the renderer's own antialiasing. Tone mapping and sRGB happen in OutputPass
 * (or the renderer, without a composer).
 */
import {
	HalfFloatType,
	Vector2,
	WebGLRenderTarget,
	type Camera,
	type Scene,
	type WebGLRenderer
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualitySettings } from '$lib/village/lighting';

export interface Picture {
	render: () => void;
	setSize: (width: number, height: number) => void;
	/** how strongly things glow: more at night */
	setBloom: (strength: number) => void;
	dispose: () => void;
}

export function createPicture(
	renderer: WebGLRenderer,
	scene: Scene,
	camera: Camera,
	quality: QualitySettings
): Picture {
	if (!quality.bloom) {
		return {
			render: () => renderer.render(scene, camera),
			setSize: () => {},
			setBloom: () => {},
			dispose: () => {}
		};
	}
	const size = renderer.getDrawingBufferSize(new Vector2());
	const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType });
	const composer = new EffectComposer(renderer, target);
	const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.45, 0.5, 0.82);
	const output = new OutputPass();
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(bloom);
	composer.addPass(output);
	// SMAA smooths edges on ordinary screens; on a high-DPI one the pixels are small
	// enough, and its three full-size passes would cost the frame rate
	const smaa = renderer.getPixelRatio() < 1.75 ? new SMAAPass() : undefined;
	if (smaa) composer.addPass(smaa);
	return {
		render: () => composer.render(),
		setSize: (width, height) => {
			composer.setPixelRatio(renderer.getPixelRatio());
			composer.setSize(width, height);
		},
		setBloom: (strength) => (bloom.strength = strength),
		dispose: () => {
			bloom.dispose();
			smaa?.dispose();
			output.dispose();
			composer.dispose();
			target.dispose();
		}
	};
}
