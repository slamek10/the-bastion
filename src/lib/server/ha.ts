/**
 * One websocket to Home Assistant for the whole server, with the
 * long-lived token (HASS_TOKEN). The browser never gets the token: it reads
 * entities through /_api/telemetry and changes them through
 * /_api/ha/service, which only lets through the domains below.
 */
import {
	callService,
	createConnection,
	createLongLivedTokenAuth,
	subscribeEntities,
	type Connection,
	type HassEntities
} from 'home-assistant-js-websocket';
import { config } from '$lib/server/config';
import type { HaEntity, PeerState } from '$lib/types';

/** what the scene reads */
export const ENTITY_DOMAINS = [
	'climate',
	'light',
	'cover',
	'sensor',
	'binary_sensor',
	'camera',
	'switch'
] as const;

/** what the HUD may change */
export const SERVICE_DOMAINS = ['light', 'cover', 'climate', 'switch', 'scene', 'script'] as const;
export type ServiceDomain = (typeof SERVICE_DOMAINS)[number];

const ENTITY_ID = /^([a-z_]+)\.[a-z0-9_]+$/;

export function keepEntity(entityId: string) {
	const domain = entityId.split('.')[0];
	return (ENTITY_DOMAINS as readonly string[]).includes(domain);
}

export interface ServiceCall {
	domain: ServiceDomain;
	service: string;
	entity_id: string[];
	data: Record<string, unknown>;
}

export class ServiceError extends Error {}

/**
 * Checks a service call from the browser: an allowed domain, a plain service
 * name, and every entity in that same domain. data may not name other
 * entities (entity_id, area_id, device_id, target are dropped).
 */
export function checkServiceCall(body: unknown): ServiceCall {
	if (!body || typeof body !== 'object') throw new ServiceError('body must be an object');
	const { domain, service, entity_id, data } = body as Record<string, unknown>;
	if (typeof domain !== 'string' || !(SERVICE_DOMAINS as readonly string[]).includes(domain))
		throw new ServiceError(`domain: one of ${SERVICE_DOMAINS.join(', ')}`);
	if (typeof service !== 'string' || !/^[a-z_]{1,64}$/.test(service))
		throw new ServiceError('service: a service name');
	const ids = Array.isArray(entity_id) ? entity_id : [entity_id];
	if (!ids.length || ids.length > 20) throw new ServiceError('entity_id: one to 20 entities');
	for (const id of ids) {
		const match = typeof id === 'string' ? id.match(ENTITY_ID) : null;
		if (!match) throw new ServiceError('entity_id: domain.object_id');
		if (match[1] !== domain) throw new ServiceError(`entity_id: ${id} is not a ${domain} entity`);
	}
	if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data)))
		throw new ServiceError('data: an object');
	const clean = { ...((data as Record<string, unknown>) ?? {}) };
	for (const key of ['entity_id', 'area_id', 'device_id', 'floor_id', 'label_id', 'target'])
		delete clean[key];
	return { domain: domain as ServiceDomain, service, entity_id: ids as string[], data: clean };
}

type Listener = (entities: Record<string, HaEntity>) => void;
type StateListener = (state: PeerState) => void;

const global = globalThis as unknown as {
	__bastionHa?: {
		connection?: Connection;
		entities: Record<string, HaEntity>;
		listeners: Set<Listener>;
		stateListeners: Set<StateListener>;
		state: PeerState;
		started: boolean;
	};
};
const ha = (global.__bastionHa ??= {
	entities: {},
	listeners: new Set(),
	stateListeners: new Set(),
	state: 'not configured',
	started: false
});

function setState(state: PeerState) {
	ha.state = state;
	for (const listener of ha.stateListeners) listener(state);
}

function filter(all: HassEntities) {
	const out: Record<string, HaEntity> = {};
	for (const [id, entity] of Object.entries(all)) {
		if (!keepEntity(id)) continue;
		const previous = ha.entities[id];
		// keep the same object when nothing changed, so diffs stay small
		out[id] =
			previous &&
			previous.state === entity.state &&
			previous.last_changed === entity.last_changed &&
			previous.attributes === entity.attributes
				? previous
				: {
						entity_id: id,
						state: entity.state,
						attributes: entity.attributes,
						last_changed: entity.last_changed
					};
	}
	return out;
}

/** connects once (retrying until it can); later drops are reconnected by the library */
export function startHa() {
	if (ha.started) return;
	ha.started = true;
	if (!config.hass) {
		setState('not configured');
		return;
	}
	let delay = 2000;
	const connect = async () => {
		setState('connecting');
		try {
			const auth = createLongLivedTokenAuth(config.hassUrl, config.hassToken);
			const connection = await createConnection({ auth });
			ha.connection = connection;
			delay = 2000;
			setState('ok');
			connection.addEventListener('disconnected', () => setState('down'));
			connection.addEventListener('ready', () => setState('ok'));
			subscribeEntities(connection, (all) => {
				ha.entities = filter(all);
				for (const listener of ha.listeners) listener(ha.entities);
			});
		} catch (error) {
			console.warn('[ha] connect failed', error);
			setState('down');
			setTimeout(connect, delay);
			delay = Math.min(delay * 2, 60_000);
		}
	};
	connect();
}

export function onEntities(listener: Listener) {
	ha.listeners.add(listener);
	listener(ha.entities);
	return () => ha.listeners.delete(listener);
}

export function onHaState(listener: StateListener) {
	ha.stateListeners.add(listener);
	listener(ha.state);
	return () => ha.stateListeners.delete(listener);
}

export const haEntities = () => ha.entities;

function connection() {
	if (!ha.connection || ha.state !== 'ok') throw new ServiceError('Home Assistant not connected');
	return ha.connection;
}

export async function runService(call: ServiceCall) {
	return callService(connection(), call.domain, call.service, call.data, {
		entity_id: call.entity_id
	});
}

/** an HLS stream's path on Home Assistant (/api/hls/<token>/master_playlist.m3u8) */
export async function cameraStream(entityId: string) {
	if (!/^camera\.[a-z0-9_]+$/.test(entityId)) throw new ServiceError('entity_id: a camera');
	const result = await connection().sendMessagePromise<{ url: string }>({
		type: 'camera/stream',
		entity_id: entityId,
		format: 'hls'
	});
	const path = new URL(result.url, 'http://ha').pathname;
	if (!path.startsWith('/api/hls/')) throw new ServiceError('unexpected stream url');
	return path;
}
