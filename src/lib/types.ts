/**
 * The Bastion's one aggregate: what every other Bastion app and Home
 * Assistant show right now, as the 3D scene and the HUD read it. The server
 * keeps it (src/lib/server/telemetry.ts), the browser gets it over
 * /_api/telemetry as a snapshot and then diffs; the demo simulator makes the
 * same shape without any server.
 */

/** the five Bastion apps */
export type AppId = 'watch' | 'ai' | 'heat' | 'ha' | 'cams';

/** the five robots, one per app */
export type AgentId = 'watchdog' | 'orchestrator' | 'thermal' | 'homekeeper' | 'vision';

export const AGENT_IDS: AgentId[] = ['watchdog', 'orchestrator', 'thermal', 'homekeeper', 'vision'];

/** rooms of the house; bindings.json maps each to Home Assistant entities */
export type RoomId = 'bunker' | 'living' | 'utility' | 'studio' | 'watchtower' | 'terrace';

export const ROOM_IDS: RoomId[] = [
	'bunker',
	'living',
	'utility',
	'studio',
	'watchtower',
	'terrace'
];

export type PeerState = 'ok' | 'connecting' | 'down' | 'not configured';

export interface ContainerState {
	name: string;
	/** Docker's: running, exited, restarting, paused, created, dead */
	state: string;
	health?: 'healthy' | 'unhealthy' | 'starting';
	/** restarts seen since this server started (Watch doesn't count them) */
	restarts: number;
	cpu?: number;
	mem?: number;
	/** Docker's own words: "Up 3 hours (healthy)" */
	status?: string;
	/** the Bastion app it belongs to, when it is one */
	app?: AppId;
}

export interface FleetProblem {
	key: string;
	severity: 'warning' | 'critical';
	/** Watch's i18n key, e.g. prob_container_exited */
	message: string;
	vars: Record<string, string>;
	since: number;
	/** the container it is about, when it is about one */
	container?: string;
}

export type VoicePhase = 'idle' | 'wake' | 'heard' | 'routed' | 'answer' | 'speaking';

export interface VoiceState {
	phase: VoicePhase;
	heard?: string;
	answer?: string;
	routed?: 'ha' | 'claude';
	at: number;
}

export interface HeatRoom {
	roomId: string;
	target?: number;
	calling: boolean;
}

export interface HeatState {
	/** any room calls for heat */
	active: boolean;
	enabled: boolean;
	rooms: HeatRoom[];
	alerts: number;
	at: number;
}

export interface CamEvent {
	id: string;
	camera: string;
	/** what was seen: person, car, … */
	label: string;
	severity: 'alert' | 'detection';
	zones: string[];
	at: number;
}

export interface CamsState {
	lastMotion?: CamEvent;
	/** newest first, at most 20 */
	recent: CamEvent[];
}

export interface HaEntity {
	entity_id: string;
	state: string;
	attributes: Record<string, unknown>;
	last_changed: string;
}

export type AgentRunState = 'idle' | 'waiting' | 'busy' | 'error';

export interface AgentState {
	state: AgentRunState;
	/** its answer is streaming in */
	speaking: boolean;
	busy: boolean;
	lastAnswer?: string;
	/** false when its app's tools can't be reached (no /mcp/key, not configured) */
	available: boolean;
	reason?: string;
}

export type FeedLevel = 'info' | 'warn' | 'alert';

export interface FeedEvent {
	id: string;
	at: number;
	source: AppId | 'bastion';
	level: FeedLevel;
	text: string;
}

export interface Telemetry {
	at: number;
	peers: Record<AppId | 'hass', PeerState>;
	containers: ContainerState[];
	problems: FleetProblem[];
	voice: VoiceState;
	heat: HeatState;
	cams: CamsState;
	/** Home Assistant entities: climate, light, cover, sensor, binary_sensor, camera, switch */
	ha: Record<string, HaEntity>;
	agents: Record<AgentId, AgentState>;
}

/** the parts a diff can replace as a whole (ha has its own entity diff) */
export type TelemetryPart = Exclude<keyof Telemetry, 'ha' | 'at'>;

export type TelemetryMessage =
	| { type: 'snapshot'; telemetry: Telemetry; events: FeedEvent[] }
	| {
			type: 'diff';
			at: number;
			set?: Partial<Pick<Telemetry, TelemetryPart>>;
			ha?: { changed: Record<string, HaEntity>; removed: string[] };
	  }
	| { type: 'event'; event: FeedEvent }
	| { type: 'ping' };

export type Bindings = Record<RoomId, string[]>;

/** a turn's NDJSON, as /_api/agents/:id/turn streams it */
export type TurnEvent =
	| { type: 'queued'; position: number }
	| { type: 'start' }
	| { type: 'tool'; name: string }
	| { type: 'text'; text: string }
	| { type: 'done'; ok: boolean; error?: string };
