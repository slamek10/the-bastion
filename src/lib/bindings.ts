/**
 * Which Home Assistant entities drive which building's objects
 * (data/bindings.json). Nothing is hard-coded: each building takes the first
 * entity of the domain it needs from its list (the boiler house's first
 * climate.* is the thermostat, the pond's first light.* the swimming area, …).
 */
import { ROOM_IDS, type Bindings, type RoomId } from '$lib/types';

export const ROOM_LABELS: Record<RoomId, string> = {
	townhall: 'Town Hall',
	forge: 'Watch Forge',
	boiler: 'Boiler House',
	cottage: 'Home Cottage',
	tower: 'Vision Tower',
	pond: 'Pond'
};

/** what each building uses, shown as a hint in the settings */
export const ROOM_HINTS: Record<RoomId, string> = {
	townhall: 'lights for the hall',
	forge: 'switches or sensors shown in the inspector',
	boiler: 'a climate.* thermostat, sensors',
	cottage: 'light.* for its windows, cover.* for its shutters',
	tower: 'camera.* entities for the lantern and its screen',
	pond: 'the swimming area light (first light.*), garden lights, switches'
};

/** the rooms of the old two-story house, and the building each became */
export const LEGACY_ROOMS: Record<string, RoomId> = {
	bunker: 'forge',
	living: 'townhall',
	utility: 'boiler',
	studio: 'cottage',
	watchtower: 'tower',
	terrace: 'pond'
};

export const emptyBindings = (): Bindings =>
	Object.fromEntries(ROOM_IDS.map((room) => [room, []])) as unknown as Bindings;

const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

/**
 * Anything into valid bindings: known buildings, entity ids only, 40 each at
 * most. A file from the house (bunker, studio, …) moves to the buildings.
 */
export function cleanBindings(value: unknown): Bindings {
	const out = emptyBindings();
	if (!value || typeof value !== 'object') return out;
	const merged: Partial<Record<RoomId, unknown[]>> = {};
	for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
		const room =
			LEGACY_ROOMS[key] ?? (ROOM_IDS.includes(key as RoomId) ? (key as RoomId) : undefined);
		if (!room || !Array.isArray(list)) continue;
		merged[room] = [...(merged[room] ?? []), ...list];
	}
	for (const room of ROOM_IDS) {
		const list = merged[room];
		if (!list) continue;
		out[room] = [
			...new Set(list.filter((id): id is string => typeof id === 'string' && ENTITY.test(id)))
		].slice(0, 40);
	}
	return out;
}

export function firstOf(bindings: Bindings, room: RoomId, domain: string) {
	return bindings[room].find((id) => id.startsWith(`${domain}.`));
}

export function allOf(bindings: Bindings, room: RoomId, domain: string) {
	return bindings[room].filter((id) => id.startsWith(`${domain}.`));
}
