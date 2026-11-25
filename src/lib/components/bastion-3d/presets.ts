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

export const PRESETS: Preset[] = [
	{
		id: 'overview',
		label: 'Overview',
		icon: 'mdi:home-group',
		position: [30, 34, 42],
		target: [0, 0, 0]
	},
	{
		id: 'townhall',
		label: 'Town Hall',
		icon: 'mdi:town-hall',
		position: [0, 9, -7],
		target: [0, 0.8, -18.5]
	},
	{
		id: 'forge',
		label: 'Watch Forge',
		icon: 'mdi:anvil',
		position: [-13, 8, 0],
		target: [-20, 1.5, -13]
	},
	{
		id: 'boiler',
		label: 'Boiler House',
		icon: 'mdi:fire',
		position: [-8, 8, 16],
		target: [-21, 1.5, 10]
	},
	{
		id: 'cottage',
		label: 'Home Cottage',
		icon: 'mdi:home-heart',
		position: [4, 8, 10],
		target: [-4, 1.5, 22]
	},
	{
		id: 'tower',
		label: 'Vision Tower',
		icon: 'mdi:cctv',
		position: [12, 10, 2],
		target: [21, 3, -8]
	},
	{ id: 'pond', label: 'Pond', icon: 'mdi:waves', position: [10, 11, 30], target: [18, 0, 12] }
];

export const presetById = (id: PresetId) =>
	PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];

/** which preset shows a building */
export const ROOM_PRESET: Record<RoomId, PresetId> = {
	townhall: 'townhall',
	forge: 'forge',
	boiler: 'boiler',
	cottage: 'cottage',
	tower: 'tower',
	pond: 'pond'
};
