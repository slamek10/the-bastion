/**
 * The village's light rigs and the quality setting: pure values, so they
 * can be tested and eased between in the scene.
 */
export type LightMode = 'golden' | 'day' | 'night';
export type Quality = 'high' | 'low';

export const LIGHT_MODES: LightMode[] = ['golden', 'day', 'night'];

export interface Rig {
	sky: number;
	fog: number;
	fogNear: number;
	fogFar: number;
	sun: number;
	sunIntensity: number;
	/** where the sun (or moon) shines from, relative to the village centre */
	sunPosition: [number, number, number];
	hemiSky: number;
	hemiGround: number;
	hemiIntensity: number;
	exposure: number;
	/** lamps, windows and the core: 0 off … 1 fully lit */
	glow: number;
}

export const RIGS: Record<LightMode, Rig> = {
	golden: {
		sky: 0xf2c59a,
		fog: 0xe8b98f,
		fogNear: 60,
		fogFar: 160,
		sun: 0xffc27a,
		sunIntensity: 3.2,
		sunPosition: [-38, 22, 26],
		hemiSky: 0xffe0bd,
		hemiGround: 0x5b6b3a,
		hemiIntensity: 1.1,
		exposure: 1.05,
		glow: 0.25
	},
	day: {
		sky: 0xa9d4f5,
		fog: 0xcfe6f7,
		fogNear: 55,
		fogFar: 140,
		sun: 0xfff6e8,
		sunIntensity: 3.6,
		sunPosition: [24, 48, 18],
		hemiSky: 0xdcefff,
		hemiGround: 0x6b7f45,
		hemiIntensity: 1.25,
		exposure: 1,
		glow: 0
	},
	night: {
		sky: 0x0e1430,
		fog: 0x121a36,
		fogNear: 35,
		fogFar: 105,
		sun: 0x9db4ff,
		sunIntensity: 0.9,
		sunPosition: [30, 40, -24],
		hemiSky: 0x3a4a80,
		hemiGround: 0x141a24,
		hemiIntensity: 0.55,
		exposure: 1.15,
		glow: 1
	}
};

export const rigFor = (mode: LightMode): Rig => RIGS[mode] ?? RIGS.golden;

export const nextLightMode = (mode: LightMode): LightMode =>
	LIGHT_MODES[(LIGHT_MODES.indexOf(mode) + 1) % LIGHT_MODES.length];

export interface QualitySettings {
	bloom: boolean;
	antialias: 'smaa' | 'msaa';
	shadowMap: number;
	/** scenery density: 1 everything, 0.5 half the trees, flowers and grass */
	density: number;
}

export function qualitySettings(quality: Quality): QualitySettings {
	return quality === 'low'
		? { bloom: false, antialias: 'msaa', shadowMap: 1024, density: 0.5 }
		: { bloom: true, antialias: 'smaa', shadowMap: 2048, density: 1 };
}

const QUALITY_KEY = 'bastion3d.quality';
const LIGHT_KEY = 'bastion3d.light';

interface StorageLike {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
}

export function loadQuality(storage?: StorageLike): Quality {
	return storage?.getItem(QUALITY_KEY) === 'low' ? 'low' : 'high';
}

export function saveQuality(quality: Quality, storage?: StorageLike) {
	storage?.setItem(QUALITY_KEY, quality);
}

export function loadLightMode(storage?: StorageLike): LightMode {
	const value = storage?.getItem(LIGHT_KEY) as LightMode | null;
	return value && LIGHT_MODES.includes(value) ? value : 'golden';
}

export function saveLightMode(mode: LightMode, storage?: StorageLike) {
	storage?.setItem(LIGHT_KEY, mode);
}

/** how big the people are next to the buildings: storybook, but they still fit through a door */
export const PEOPLE_SCALE = 1.4;
/** the kit's round door frame's opening, metres */
export const DOOR_HEIGHT = 2.55;
