/**
 * Which Home Assistant entities drive which room's objects (data/bindings.json).
 * Nothing is hard-coded: each scene builder takes the first entity of the
 * domain it needs from its room's list (the utility room's first climate.*
 * is the thermostat, the terrace's first light.* the pool light, …).
 */
import { ROOM_IDS, type Bindings, type RoomId } from '$lib/types';

export const ROOM_LABELS: Record<RoomId, string> = {
	bunker: 'Server Bunker',
	living: 'Neural Core',
	utility: 'Climate Deck',
	studio: 'HA Studio',
	watchtower: 'Security Bunk',
	terrace: 'Terrace & Pool'
};

/** what each room uses, shown as a hint in the settings */
export const ROOM_HINTS: Record<RoomId, string> = {
	bunker: 'switches or sensors shown in the inspector',
	living: 'lights for the living room',
	utility: 'a climate.* thermostat, sensors',
	studio: 'lights and cover.* roller shutters',
	watchtower: 'camera.* entities for the monitors and the PoE camera',
	terrace: 'the pool light (first light.*), garden lights, switches'
};

export const emptyBindings = (): Bindings =>
	Object.fromEntries(ROOM_IDS.map((room) => [room, []])) as unknown as Bindings;

const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

/** anything into valid bindings: known rooms, entity ids only, 40 per room at most */
export function cleanBindings(value: unknown): Bindings {
	const out = emptyBindings();
	if (!value || typeof value !== 'object') return out;
	for (const room of ROOM_IDS) {
		const list = (value as Record<string, unknown>)[room];
		if (!Array.isArray(list)) continue;
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
