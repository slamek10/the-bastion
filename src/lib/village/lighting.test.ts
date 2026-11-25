import { describe, expect, it } from 'vitest';
import {
	DOOR_HEIGHT,
	LIGHT_MODES,
	PEOPLE_SCALE,
	loadLightMode,
	loadQuality,
	nextLightMode,
	qualitySettings,
	rigFor,
	saveLightMode,
	saveQuality
} from './lighting';
import { ORBIT, PRESETS, orbitOf } from '$lib/components/bastion-3d/presets';
import { LOOKS } from '$lib/components/bastion-3d/agents/looks';

function memory() {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	};
}

describe('lighting rigs', () => {
	it('golden hour by default; day is brightest, night has every light on', () => {
		expect(loadLightMode(memory())).toBe('golden');
		expect(rigFor('day').sunIntensity).toBeGreaterThan(rigFor('golden').sunIntensity);
		expect(rigFor('night').sunIntensity).toBeLessThan(rigFor('golden').sunIntensity);
		expect(rigFor('night').glow).toBe(1);
		expect(rigFor('day').glow).toBe(0);
		for (const mode of LIGHT_MODES) expect(rigFor(mode).sunPosition[1]).toBeGreaterThan(0);
	});

	it('cycles golden → day → night and remembers the choice', () => {
		expect(nextLightMode('golden')).toBe('day');
		expect(nextLightMode('day')).toBe('night');
		expect(nextLightMode('night')).toBe('golden');
		const storage = memory();
		saveLightMode('night', storage);
		expect(loadLightMode(storage)).toBe('night');
		storage.setItem('bastion3d.light', 'disco');
		expect(loadLightMode(storage)).toBe('golden');
	});
});

describe('quality', () => {
	it('High has bloom and 2048 shadows; Low drops bloom, halves shadows and scenery', () => {
		expect(qualitySettings('high')).toEqual({
			bloom: true,
			antialias: 'smaa',
			shadowMap: 2048,
			density: 1
		});
		expect(qualitySettings('low')).toEqual({
			bloom: false,
			antialias: 'msaa',
			shadowMap: 1024,
			density: 0.5
		});
	});

	it('is stored, and anything unknown is High', () => {
		const storage = memory();
		expect(loadQuality(storage)).toBe('high');
		saveQuality('low', storage);
		expect(loadQuality(storage)).toBe('low');
		storage.setItem('bastion3d.quality', 'ultra');
		expect(loadQuality(storage)).toBe('high');
		expect(loadQuality(undefined)).toBe('high');
	});
});

describe('camera presets', () => {
	it('every preset sits inside the orbit limits', () => {
		for (const preset of PRESETS) {
			const { distance, polar } = orbitOf(preset);
			expect(distance, preset.id).toBeGreaterThanOrEqual(ORBIT.minDistance);
			expect(distance, preset.id).toBeLessThanOrEqual(ORBIT.maxDistance);
			expect(polar, preset.id).toBeGreaterThanOrEqual(ORBIT.minPolar);
			expect(polar, preset.id).toBeLessThanOrEqual(ORBIT.maxPolar);
			expect(Math.hypot(preset.target[0], preset.target[2]), preset.id).toBeLessThanOrEqual(
				ORBIT.targetRadius
			);
			expect(preset.position[1], preset.id).toBeGreaterThan(1);
		}
	});
});

describe('people next to doors', () => {
	it('everyone is bigger than life but fits through a door', () => {
		for (const [id, look] of Object.entries(LOOKS)) {
			const height = look.height * PEOPLE_SCALE;
			expect(height, id).toBeLessThanOrEqual(DOOR_HEIGHT);
			expect(height, id).toBeGreaterThan(DOOR_HEIGHT * 0.8);
		}
	});
});
