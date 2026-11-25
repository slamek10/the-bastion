/**
 * The 3D view's state, one runes class: telemetry (live from
 * /_api/telemetry, or the demo simulator), the event feed, mode, day mode,
 * selection, camera preset, bindings, chats with the robots. The scene reads
 * `telemetry` every frame; it's $state.raw because each message replaces it.
 */
import { applyMessage, emptyTelemetry, pushEvent } from '$lib/telemetry';
import { DemoSimulator, DEMO_BINDINGS, type DemoTrigger } from '$lib/demo';
import { emptyBindings } from '$lib/bindings';
import type { PresetId } from '$lib/components/bastion-3d/presets';
import {
	AGENT_IDS,
	type AgentId,
	type Bindings,
	type FeedEvent,
	type OrderTarget,
	type RoomId,
	type Telemetry,
	type TelemetryMessage,
	type TurnEvent
} from '$lib/types';

export type Selection = { kind: 'agent'; id: AgentId } | { kind: 'room'; id: RoomId };

export interface ChatLine {
	role: 'user' | 'agent' | 'tool' | 'error';
	text: string;
}

export interface Chat {
	lines: ChatLine[];
	status: 'idle' | 'waiting' | 'streaming';
	position?: number;
}

const emptyChats = () =>
	Object.fromEntries(
		AGENT_IDS.map((id) => [id, { lines: [], status: 'idle' }])
	) as unknown as Record<AgentId, Chat>;

export class Bastion3DState {
	telemetry: Telemetry = $state.raw(emptyTelemetry());
	events: FeedEvent[] = $state.raw([]);
	mode: 'live' | 'demo' = $state('live');
	dayMode: 'twilight' | 'day' = $state('twilight');
	selection: Selection | null = $state(null);
	preset: PresetId = $state('overview');
	/** bumps when the same preset is asked for again, so the camera flies back */
	presetNonce = $state(0);
	bindings: Bindings = $state(emptyBindings());
	connection: 'connecting' | 'open' | 'closed' = $state('closed');
	/** the camera entity in the modal */
	cameraModal: string | null = $state(null);
	settingsOpen = $state(false);
	chats: Record<AgentId, Chat> = $state(emptyChats());
	/** no shared login on the server: only the demo can run */
	configured = $state(true);

	private source: EventSource | undefined;
	private demo: DemoSimulator | undefined;
	private liveBindings: Bindings = emptyBindings();
	// not shown anywhere: a plain Map
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private aborts = new Map<AgentId, AbortController>();

	receive = (message: TelemetryMessage) => {
		if (message.type === 'event') this.events = pushEvent(this.events, message.event);
		else if (message.type === 'snapshot') {
			this.telemetry = message.telemetry;
			this.events = message.events;
		} else if (message.type === 'diff') this.telemetry = applyMessage(this.telemetry, message);
	};

	start(configured: boolean) {
		this.configured = configured;
		if (!configured) this.mode = 'demo';
		this.connect();
	}

	stop() {
		this.source?.close();
		this.source = undefined;
		this.demo?.stop();
		this.demo = undefined;
		for (const abort of this.aborts.values()) abort.abort();
		this.aborts.clear();
		this.connection = 'closed';
	}

	private connect() {
		this.stop();
		this.telemetry = emptyTelemetry();
		this.events = [];
		this.chats = emptyChats();
		if (this.mode === 'demo') {
			this.bindings = structuredClone(DEMO_BINDINGS);
			this.demo = new DemoSimulator(this.receive);
			this.demo.start();
			this.connection = 'open';
			return;
		}
		this.bindings = this.liveBindings;
		this.loadBindings();
		this.connection = 'connecting';
		const source = new EventSource('/_api/telemetry');
		source.onopen = () => (this.connection = 'open');
		source.onerror = () => (this.connection = source.readyState === 2 ? 'closed' : 'connecting');
		source.onmessage = (event) => {
			try {
				this.receive(JSON.parse(event.data));
			} catch {
				// a broken line
			}
		};
		this.source = source;
	}

	setMode(mode: 'live' | 'demo') {
		if (mode === 'live' && !this.configured) return;
		if (mode === this.mode) return;
		this.mode = mode;
		this.connect();
	}

	trigger(kind: DemoTrigger) {
		this.demo?.trigger(kind);
	}

	select(selection: Selection | null) {
		this.selection = selection;
	}

	goto(preset: PresetId) {
		this.preset = preset;
		this.presetNonce++;
	}

	private async loadBindings() {
		try {
			const response = await fetch('/_api/bindings');
			if (response.ok) {
				this.liveBindings = await response.json();
				if (this.mode === 'live') this.bindings = this.liveBindings;
			}
		} catch {
			// keeps the empty ones
		}
	}

	async saveBindings(bindings: Bindings) {
		if (this.mode === 'demo') {
			this.bindings = bindings;
			return true;
		}
		const response = await fetch('/_api/bindings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(bindings)
		});
		if (!response.ok) return false;
		this.liveBindings = await response.json();
		this.bindings = this.liveBindings;
		return true;
	}

	/** a Home Assistant service from a HUD button */
	async callService(
		domain: string,
		service: string,
		entityId: string,
		data?: Record<string, unknown>
	) {
		if (this.mode === 'demo') {
			this.demo?.service(domain, service, entityId, data);
			return { ok: true };
		}
		const response = await fetch('/_api/ha/service', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ domain, service, entity_id: entityId, ...(data && { data }) })
		});
		return (await response.json().catch(() => ({ ok: false, error: `${response.status}` }))) as {
			ok: boolean;
			error?: string;
		};
	}

	/** a live stream's URL on this app, or an error */
	async cameraUrl(entityId: string): Promise<{ url?: string; error?: string }> {
		if (this.mode === 'demo') return { error: 'Demo mode: no camera streams' };
		const response = await fetch('/_api/camera/stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ entity_id: entityId })
		});
		const body = await response.json().catch(() => ({}));
		return response.ok && body.url
			? { url: body.url }
			: { error: body.error ?? `${response.status}` };
	}

	/** files a change request through a robot */
	async fileOrder(from: AgentId, targets: OrderTarget[], request: string) {
		if (this.mode === 'demo') {
			this.demo?.fileOrder(from, targets, request);
			return { ok: true };
		}
		const response = await fetch('/_api/orders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ from, targets, request })
		});
		return (await response.json().catch(() => ({ ok: false, error: `${response.status}` }))) as {
			ok: boolean;
			error?: string;
		};
	}

	/** your answer to a plan, or cancelling */
	async answerOrder(
		id: string,
		action: 'approve' | 'changes' | 'reject' | 'cancel',
		text?: string
	) {
		if (this.mode === 'demo') {
			return this.demo?.answerOrder(id, action, text) ?? { ok: false };
		}
		const response = await fetch(`/_api/orders/${encodeURIComponent(id)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, ...(text && { text }) })
		});
		return (await response.json().catch(() => ({ ok: false, error: `${response.status}` }))) as {
			ok: boolean;
			error?: string;
		};
	}

	private line(id: AgentId, line: ChatLine) {
		this.chats[id].lines.push(line);
	}

	private appendAgent(id: AgentId, text: string) {
		const lines = this.chats[id].lines;
		const last = lines[lines.length - 1];
		if (last?.role === 'agent') last.text += text;
		else lines.push({ role: 'agent', text });
	}

	async send(id: AgentId, message: string) {
		const chat = this.chats[id];
		if (chat.status !== 'idle' || !message.trim()) return;
		this.line(id, { role: 'user', text: message });
		if (this.mode === 'demo' && this.demo) {
			chat.status = 'streaming';
			for await (const piece of this.demo.chat(id, message)) this.appendAgent(id, piece);
			chat.status = 'idle';
			return;
		}
		chat.status = 'waiting';
		const abort = new AbortController();
		this.aborts.set(id, abort);
		try {
			const response = await fetch(`/_api/agents/${id}/turn`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message }),
				signal: abort.signal
			});
			if (!response.ok || !response.body)
				throw new Error(`${response.status} ${await response.text()}`);
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = '';
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += value;
				let end;
				while ((end = buffer.indexOf('\n')) >= 0) {
					const raw = buffer.slice(0, end);
					buffer = buffer.slice(end + 1);
					let event: TurnEvent;
					try {
						event = JSON.parse(raw);
					} catch {
						continue;
					}
					if (event.type === 'queued') {
						chat.status = 'waiting';
						chat.position = event.position;
					} else if (event.type === 'start') chat.status = 'streaming';
					else if (event.type === 'tool')
						this.line(id, { role: 'tool', text: event.name.replace(/^mcp__[a-z]+__/, '') });
					else if (event.type === 'text') this.appendAgent(id, event.text);
					else if (event.type === 'done' && !event.ok)
						this.line(id, { role: 'error', text: event.error ?? 'failed' });
				}
			}
		} catch (error) {
			if (!abort.signal.aborted) this.line(id, { role: 'error', text: (error as Error).message });
		} finally {
			this.aborts.delete(id);
			chat.status = 'idle';
			chat.position = undefined;
		}
	}
}

export const bastion3d = new Bastion3DState();
