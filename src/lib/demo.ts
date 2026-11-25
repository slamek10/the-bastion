/**
 * Demo mode: a local simulator that makes the same Telemetry messages the
 * server does (containers, problems, heating, motion, voice, agents, lights
 * and shutters), so the scene can be tried with no server and no apps.
 * Random things happen on their own; the HUD's triggers force them.
 */
import { applyMessage, emptyTelemetry, idleAgent, pushEvent } from '$lib/telemetry';
import {
	canMove,
	createOrder,
	moveOrder,
	visibleOrders,
	type Actor,
	type MoveDetails
} from '$lib/orders';
import {
	AGENT_IDS,
	type AgentId,
	type Bindings,
	type FeedEvent,
	type FeedLevel,
	type HaEntity,
	type OrderStatus,
	type OrderTarget,
	type WorkOrder,
	ORDER_REPO,
	type Telemetry,
	type TelemetryMessage
} from '$lib/types';

const CONTAINERS: [string, Telemetry['containers'][number]['app']][] = [
	['bastion-ha', 'ha'],
	['bastion-ha-caddy', 'ha'],
	['bastion-ai', 'ai'],
	['bastion-heat', 'heat'],
	['bastion-cams', 'cams'],
	['frigate', 'cams'],
	['bastion-watch', 'watch'],
	['clickhouse', 'watch'],
	['whisper', 'ha'],
	['homeassistant', undefined],
	['mosquitto', undefined],
	['the-bastion', undefined]
];

const CAMERAS = ['gate', 'driveway', 'garden', 'terrace'];

export const DEMO_BINDINGS: Bindings = {
	forge: ['switch.demo_rack_fan'],
	townhall: ['light.demo_living'],
	boiler: ['climate.demo_boiler', 'sensor.demo_buffer_tank'],
	cottage: ['light.demo_studio', 'cover.demo_studio_left', 'cover.demo_studio_right'],
	tower: CAMERAS.map((camera) => `camera.demo_${camera}`),
	pond: ['light.demo_pool', 'light.demo_garden']
};

function entity(id: string, state: string, attributes: Record<string, unknown> = {}): HaEntity {
	return { entity_id: id, state, attributes, last_changed: new Date().toISOString() };
}

function demoEntities(): Record<string, HaEntity> {
	const list = [
		entity('light.demo_living', 'on', {
			brightness: 180,
			rgb_color: [255, 196, 140],
			friendly_name: 'Living room'
		}),
		entity('light.demo_studio', 'on', {
			brightness: 220,
			rgb_color: [160, 200, 255],
			friendly_name: 'Studio'
		}),
		entity('light.demo_pool', 'on', {
			brightness: 255,
			rgb_color: [60, 200, 255],
			friendly_name: 'Pool'
		}),
		entity('light.demo_garden', 'off', { friendly_name: 'Garden' }),
		entity('cover.demo_studio_left', 'open', {
			current_position: 100,
			friendly_name: 'Studio shutter L'
		}),
		entity('cover.demo_studio_right', 'open', {
			current_position: 60,
			friendly_name: 'Studio shutter R'
		}),
		entity('climate.demo_boiler', 'heat', {
			current_temperature: 21.4,
			temperature: 22,
			hvac_action: 'idle',
			friendly_name: 'House'
		}),
		entity('sensor.demo_buffer_tank', '48', {
			unit_of_measurement: '°C',
			friendly_name: 'Buffer tank'
		}),
		entity('switch.demo_rack_fan', 'on', { friendly_name: 'Rack fan' }),
		...CAMERAS.map((camera) =>
			entity(`camera.demo_${camera}`, 'streaming', { friendly_name: camera })
		)
	];
	return Object.fromEntries(list.map((e) => [e.entity_id, e]));
}

type Emit = (message: TelemetryMessage) => void;

export type DemoTrigger = 'containerDown' | 'motion' | 'heatingOn' | 'voice' | 'agents';

export class DemoSimulator {
	state: Telemetry;
	events: FeedEvent[] = [];
	private timers: ReturnType<typeof setTimeout>[] = [];
	private interval: ReturnType<typeof setInterval> | undefined;
	private seq = 0;

	constructor(
		private emit: Emit,
		private random: () => number = Math.random,
		private now: () => number = Date.now
	) {
		const t = emptyTelemetry(this.now());
		t.peers = { watch: 'ok', ai: 'ok', heat: 'ok', ha: 'ok', cams: 'ok', hass: 'ok' };
		t.containers = CONTAINERS.map(([name, app]) => ({
			name,
			state: 'running',
			health: 'healthy' as const,
			restarts: 0,
			cpu: Math.round(this.random() * 30),
			mem: Math.round(100 + this.random() * 900),
			status: 'Up 3 days (healthy)',
			...(app && { app })
		}));
		t.heat = {
			active: false,
			enabled: true,
			rooms: ['dnevni', 'kuhinja', 'spavaca', 'ured'].map((roomId) => ({
				roomId,
				target: 21,
				calling: false
			})),
			alerts: 0,
			at: this.now()
		};
		t.ha = demoEntities();
		// a problem that has stood for hours: shown at the forge, not alarmed
		t.problems = [
			{
				key: 'pve|node|pve02',
				severity: 'critical',
				message: 'prob_node_offline',
				vars: { name: 'pve02' },
				since: this.now() - 3 * 3_600_000
			}
		];
		t.agents = Object.fromEntries(AGENT_IDS.map((id) => [id, idleAgent()])) as Telemetry['agents'];
		this.state = t;
	}

	/** sends the snapshot and starts the random events */
	start(tickMs = 4000) {
		this.emit({ type: 'snapshot', telemetry: this.state, events: this.events });
		this.log('bastion', 'info', 'Demo mode: simulated fleet');
		this.interval = setInterval(() => this.tick(), tickMs);
	}

	stop() {
		if (this.interval) clearInterval(this.interval);
		for (const timer of this.timers) clearTimeout(timer);
		this.timers = [];
	}

	private later(ms: number, fn: () => void) {
		this.timers.push(setTimeout(fn, ms));
	}

	private set(change: Partial<Telemetry>) {
		const at = this.now();
		const message: TelemetryMessage = { type: 'diff', at, set: change as never };
		this.state = applyMessage(this.state, message);
		this.emit(message);
	}

	private setEntity(id: string, state: string, attributes: Record<string, unknown>) {
		const at = this.now();
		const message: TelemetryMessage = {
			type: 'diff',
			at,
			ha: { changed: { [id]: { ...entity(id, state, attributes) } }, removed: [] }
		};
		this.state = applyMessage(this.state, message);
		this.emit(message);
	}

	private log(source: FeedEvent['source'], level: FeedLevel, text: string) {
		const event: FeedEvent = { id: `demo-${++this.seq}`, at: this.now(), source, level, text };
		this.events = pushEvent(this.events, event);
		this.emit({ type: 'event', event });
	}

	private setAgent(id: AgentId, patch: Partial<Telemetry['agents'][AgentId]>) {
		this.set({ agents: { ...this.state.agents, [id]: { ...this.state.agents[id], ...patch } } });
	}

	/** one random thing (or none) */
	tick() {
		const roll = this.random();
		if (roll < 0.08) this.trigger('containerDown');
		else if (roll < 0.25) this.trigger('motion');
		else if (roll < 0.35) this.trigger('heatingOn');
		else if (roll < 0.45) this.trigger('voice');
		else if (roll < 0.55) this.trigger('agents');
		else if (roll < 0.7) this.wiggleEntities();
		// container metrics drift
		this.set({
			containers: this.state.containers.map((c) =>
				c.state === 'running'
					? {
							...c,
							cpu: Math.max(0, Math.min(100, (c.cpu ?? 5) + Math.round((this.random() - 0.5) * 10)))
						}
					: c
			)
		});
	}

	private wiggleEntities() {
		const right = this.state.ha['cover.demo_studio_right'];
		const position = Math.round(this.random() * 100);
		this.setEntity('cover.demo_studio_right', position > 0 ? 'open' : 'closed', {
			...right?.attributes,
			current_position: position
		});
		const living = this.state.ha['light.demo_living'];
		const on = this.random() > 0.3;
		this.setEntity('light.demo_living', on ? 'on' : 'off', {
			...living?.attributes,
			brightness: Math.round(60 + this.random() * 195)
		});
	}

	/** what the HUD's simulation buttons call */
	trigger(kind: DemoTrigger) {
		switch (kind) {
			case 'containerDown': {
				const candidates = this.state.containers.filter((c) => c.state === 'running');
				const victim = candidates[Math.floor(this.random() * candidates.length)];
				if (!victim) return;
				const key = `docker|container|${victim.name}`;
				this.set({
					containers: this.state.containers.map((c) =>
						c.name === victim.name
							? {
									...c,
									state: 'exited',
									health: undefined,
									status: 'Exited (137) just now',
									cpu: 0,
									downSince: this.now()
								}
							: c
					),
					problems: [
						...this.state.problems,
						{
							key,
							severity: 'critical',
							message: 'prob_container_exited',
							vars: { name: victim.name, code: '137' },
							since: this.now(),
							container: victim.name
						}
					]
				});
				this.log('watch', 'alert', `${victim.name} exited (137)`);
				this.later(12_000, () => {
					this.set({
						containers: this.state.containers.map((c) =>
							c.name === victim.name
								? {
										...c,
										state: 'running',
										health: 'healthy',
										status: 'Up 1 second (healthy)',
										restarts: c.restarts + 1,
										downSince: undefined
									}
								: c
						),
						problems: this.state.problems.filter((p) => p.key !== key)
					});
					this.log('watch', 'info', `${victim.name} is running again`);
				});
				return;
			}
			case 'motion': {
				const camera = CAMERAS[Math.floor(this.random() * CAMERAS.length)];
				const label = this.random() > 0.5 ? 'person' : 'car';
				const event = {
					id: `demo-review-${++this.seq}`,
					camera,
					label,
					severity: this.random() > 0.6 ? ('alert' as const) : ('detection' as const),
					zones: camera === 'gate' ? ['gate'] : [],
					at: this.now()
				};
				this.set({
					cams: { lastMotion: event, recent: [event, ...this.state.cams.recent].slice(0, 20) }
				});
				this.log('cams', event.severity === 'alert' ? 'warn' : 'info', `${label} at ${camera}`);
				return;
			}
			case 'heatingOn': {
				const rooms = this.state.heat.rooms.map((room) => ({
					...room,
					calling: this.random() > 0.4
				}));
				if (!rooms.some((room) => room.calling)) rooms[0].calling = true;
				this.set({ heat: { ...this.state.heat, active: true, rooms, at: this.now() } });
				const climate = this.state.ha['climate.demo_boiler'];
				this.setEntity('climate.demo_boiler', 'heat', {
					...climate?.attributes,
					hvac_action: 'heating'
				});
				this.log(
					'heat',
					'info',
					`Heating on: ${rooms
						.filter((r) => r.calling)
						.map((r) => r.roomId)
						.join(', ')}`
				);
				this.later(15_000, () => {
					this.set({
						heat: {
							...this.state.heat,
							active: false,
							rooms: this.state.heat.rooms.map((r) => ({ ...r, calling: false }))
						}
					});
					const c = this.state.ha['climate.demo_boiler'];
					this.setEntity('climate.demo_boiler', 'heat', {
						...c?.attributes,
						hvac_action: 'idle',
						current_temperature: 22
					});
					this.log('heat', 'info', 'Heating off');
				});
				return;
			}
			case 'voice': {
				const phrases = [
					['Upali svjetlo u dnevnoj sobi', 'Upalio sam svjetlo u dnevnoj sobi.'],
					['Is anyone at the gate?', 'Nobody at the gate in the last hour.'],
					['Koliko je toplo u uredu?', 'U uredu je 21,4 °C.']
				];
				const [heard, answer] = phrases[Math.floor(this.random() * phrases.length)];
				const at = this.now();
				this.set({ voice: { phase: 'wake', at } });
				this.later(800, () => {
					this.set({ voice: { phase: 'heard', heard, at: this.now() } });
					this.log('ha', 'info', `Heard: “${heard}”`);
				});
				this.later(2000, () =>
					this.set({
						voice: { ...this.state.voice, phase: 'routed', routed: 'claude', at: this.now() }
					})
				);
				this.later(3500, () => {
					this.set({ voice: { ...this.state.voice, phase: 'answer', answer, at: this.now() } });
					this.log('ha', 'info', `Answered: ${answer}`);
				});
				this.later(4200, () =>
					this.set({ voice: { ...this.state.voice, phase: 'speaking', at: this.now() } })
				);
				this.later(7000, () =>
					this.set({ voice: { ...this.state.voice, phase: 'idle', at: this.now() } })
				);
				return;
			}
			case 'agents': {
				// two turns at once: they walk toward each other (COLLAB)
				const shuffled = [...AGENT_IDS].sort(() => this.random() - 0.5);
				const [a, b] = shuffled;
				for (const id of [a, b]) this.setAgent(id, { state: 'busy', busy: true, speaking: false });
				this.later(2500, () => {
					for (const id of [a, b]) this.setAgent(id, { speaking: true });
				});
				this.later(6000, () => {
					for (const id of [a, b])
						this.setAgent(id, {
							state: 'idle',
							busy: false,
							speaking: false,
							lastAnswer: 'Demo: everything I can see looks fine.'
						});
					this.log('bastion', 'info', `${a} and ${b} answered`);
				});
				return;
			}
		}
	}

	/* ------------------------------------------------ work orders, played by a pretend orchestrator */

	private orders: WorkOrder[] = [];

	private putOrder(order: WorkOrder) {
		this.orders = [order, ...this.orders.filter((o) => o.id !== order.id)];
		this.set({ orders: visibleOrders(this.orders) });
	}

	private moveDemo(id: string, actor: Actor, to: OrderStatus, details: MoveDetails = {}) {
		const order = this.orders.find((o) => o.id === id);
		if (!order || !canMove(order, actor, to)) return undefined;
		const next = moveOrder(order, actor, to, details, this.now());
		this.putOrder(next);
		this.log(
			'bastion',
			to === 'awaiting_approval' ? 'warn' : 'info',
			`Order ${id}: ${next.log[next.log.length - 1].text}`
		);
		return next;
	}

	private plan(order: WorkOrder, revised = false) {
		const repos = (order.apps.length ? order.apps : ['heat' as OrderTarget]).map(
			(a) => ORDER_REPO[a]
		);
		return [
			`**Goal:** ${order.request}`,
			'',
			`**Changes** (${repos.join(', ')}):`,
			'- the files and functions the app session would touch',
			'- a test for the new behaviour',
			revised && order.feedback ? `- revised as you asked: ${order.feedback}` : '',
			'',
			'**Ship:** build, deploy, check health, roll back if it isn’t healthy.',
			'',
			'_Demo: no code is changed._'
		]
			.filter((line, i, all) => line || all[i - 1])
			.join('\n');
	}

	fileOrder(from: AgentId, targets: OrderTarget[], request: string) {
		const order = createOrder(from, targets, request, this.now(), `demo${++this.seq}`);
		this.putOrder(order);
		this.log('bastion', 'info', `Change requested: ${order.request.slice(0, 80)}`);
		this.later(1500, () => this.moveDemo(order.id, 'orchestrator', 'planning'));
		this.later(5000, () => {
			const current = this.orders.find((o) => o.id === order.id);
			if (current)
				this.moveDemo(order.id, 'orchestrator', 'awaiting_approval', {
					plan: this.plan(current),
					apps: current.targets.length ? current.targets : ['heat']
				});
		});
	}

	answerOrder(id: string, action: 'approve' | 'changes' | 'reject' | 'cancel', text?: string) {
		const to: Record<typeof action, OrderStatus> = {
			approve: 'approved',
			changes: 'planning',
			reject: 'rejected',
			cancel: 'cancelled'
		};
		try {
			if (!this.moveDemo(id, 'you', to[action], { text })) return { ok: false, error: 'not now' };
		} catch (error) {
			return { ok: false, error: (error as Error).message };
		}
		if (action === 'changes') {
			this.later(4000, () => {
				const current = this.orders.find((o) => o.id === id);
				if (current)
					this.moveDemo(id, 'orchestrator', 'awaiting_approval', {
						plan: this.plan(current, true),
						apps: current.apps
					});
			});
		} else if (action === 'approve') {
			const app = this.orders.find((o) => o.id === id)?.apps[0] ?? 'heat';
			const repo = ORDER_REPO[app];
			const sha = Math.floor(this.random() * 0xfffffff)
				.toString(16)
				.padStart(7, '0');
			this.later(4000, () =>
				this.moveDemo(id, 'orchestrator', 'coding', { text: `Brief sent to ${repo}` })
			);
			this.later(12_000, () =>
				this.moveDemo(id, 'orchestrator', 'ready', {
					commit: { app, branch: 'main', commit: sha, summary: 'demo change' },
					text: `ready to ship: ${repo} main ${sha}`
				})
			);
			this.later(14_000, () => this.moveDemo(id, 'orchestrator', 'shipping'));
			this.later(19_000, () => this.moveDemo(id, 'orchestrator', 'deployed'));
		}
		return { ok: true };
	}

	/** a demo chat answer, streamed like a real turn */
	async *chat(id: AgentId, message: string): AsyncGenerator<string> {
		this.setAgent(id, { state: 'busy', busy: true });
		const answer = `(demo) ${id} heard “${message.slice(0, 80)}”. In live mode I'd look at my app's tools and answer from them.`;
		this.setAgent(id, { speaking: true });
		for (const word of answer.split(' ')) {
			await new Promise((resolve) => setTimeout(resolve, 40));
			yield `${word} `;
		}
		this.setAgent(id, { state: 'idle', busy: false, speaking: false, lastAnswer: answer });
	}

	/** a demo service call: the entity changes as Home Assistant would change it */
	service(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}) {
		const current = this.state.ha[entityId];
		if (!current) return;
		const attrs = { ...current.attributes, ...data };
		if (domain === 'light' || domain === 'switch') {
			const on = service === 'toggle' ? current.state !== 'on' : service === 'turn_on';
			this.setEntity(entityId, on ? 'on' : 'off', attrs);
		} else if (domain === 'cover') {
			const position =
				service === 'open_cover'
					? 100
					: service === 'close_cover'
						? 0
						: Number(data.position ?? 50);
			this.setEntity(entityId, position > 0 ? 'open' : 'closed', {
				...attrs,
				current_position: position
			});
		} else if (domain === 'climate' && typeof data.temperature === 'number') {
			this.setEntity(entityId, current.state, { ...attrs, temperature: data.temperature });
		}
		this.log('ha', 'info', `${domain}.${service} → ${entityId}`);
	}
}
