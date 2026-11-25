/** the camera views of the bottom bar: position and look-at target, in metres */
import type { RoomId } from '$lib/types';

export type PresetId = 'overview' | 'townhall' | 'forge' | 'boiler' | 'cottage' | 'tower' | 'pond';

export interface Preset {
	id: PresetId;
	label: string;
	icon: string;
	position: [number, number, number];
	target: [number, number, number];
}

/** where the orbit camera may go: never under the ground, never so far the village is a map */
export const ORBIT = {
	minDistance: 5,
	maxDistance: 75,
	minPolar: 0.2,
	maxPolar: 1.32,
	/** the look-at point stays within this radius of the village centre */
	targetRadius: 38
};

export const PRESETS: Preset[] = [
	// a close three-quarter view: the village fills the screen, people are readable
	{
		id: 'overview',
		label: 'Overview',
		icon: 'mdi:home-group',
		position: [31, 24, 24],
		target: [1, 0, -1]
	},
	{
		id: 'townhall',
		label: 'Town Hall',
		icon: 'mdi:town-hall',
		position: [5, 11, -4.5],
		target: [0, 0.8, -18.2]
	},
	{
		id: 'forge',
		label: 'Watch Forge',
		icon: 'mdi:anvil',
		position: [-13, 9.5, 1.5],
		target: [-20, 1.6, -13]
	},
	{
		id: 'boiler',
		label: 'Boiler House',
		icon: 'mdi:fire',
		position: [-9, 7.5, 16],
		target: [-20, 1.6, 10]
	},
	{
		id: 'cottage',
		label: 'Home Cottage',
		icon: 'mdi:home-heart',
		position: [4, 8, 11],
		target: [-4, 1.6, 21]
	},
	{
		id: 'tower',
		label: 'Vision Tower',
		icon: 'mdi:cctv',
		position: [6, 12, 6],
		target: [21, 5.5, -8]
	},
	{ id: 'pond', label: 'Pond', icon: 'mdi:waves', position: [9, 10, 28], target: [17, 0, 12] }
];

export const presetById = (id: PresetId) =>
	PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];

/** distance and polar angle (from straight up) of a preset's camera around its target */
export function orbitOf(preset: Preset) {
	const [px, py, pz] = preset.position;
	const [tx, ty, tz] = preset.target;
	const distance = Math.hypot(px - tx, py - ty, pz - tz);
	return { distance, polar: Math.acos((py - ty) / distance) };
}

/** which preset shows a building */
export const ROOM_PRESET: Record<RoomId, PresetId> = {
	townhall: 'townhall',
	forge: 'forge',
	boiler: 'boiler',
	cottage: 'cottage',
	tower: 'tower',
	pond: 'pond'
};
