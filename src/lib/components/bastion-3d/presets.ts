/** the camera views of the bottom bar: position and look-at target, in metres */
export type PresetId = 'overview' | 'rack' | 'core' | 'climate' | 'studio' | 'security' | 'terrace';

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
		icon: 'mdi:home-city-outline',
		position: [16, 15, 22],
		target: [0, 2.5, 0]
	},
	{
		id: 'rack',
		label: 'Server Rack',
		icon: 'mdi:server',
		position: [13.5, 3.2, 8],
		target: [9.5, 1.3, -1]
	},
	{
		id: 'core',
		label: 'Neural Core',
		icon: 'mdi:brain',
		position: [3, 4, 9],
		target: [1, 1.4, -1]
	},
	{
		id: 'climate',
		label: 'Climate Deck',
		icon: 'mdi:fire',
		position: [-5, 3.5, 7],
		target: [-7, 1.3, -1]
	},
	{
		id: 'studio',
		label: 'HA Studio',
		icon: 'mdi:home-assistant',
		position: [-4, 9, 10],
		target: [-5, 4.2, -1.5]
	},
	{
		id: 'security',
		label: 'Security Bunk',
		icon: 'mdi:cctv',
		position: [3.5, 9, 10],
		target: [3, 4.2, -1.5]
	},
	{
		id: 'terrace',
		label: 'Terrace & Pool',
		icon: 'mdi:pool',
		position: [6, 6, 22],
		target: [2, 0.5, 11]
	}
];

export const presetById = (id: PresetId) =>
	PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];

/** which preset shows a room or an agent's home */
export const ROOM_PRESET = {
	bunker: 'rack',
	living: 'core',
	utility: 'climate',
	studio: 'studio',
	watchtower: 'security',
	terrace: 'terrace'
} as const satisfies Record<string, PresetId>;
