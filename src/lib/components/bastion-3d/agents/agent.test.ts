import { describe, expect, it } from 'vitest';
import { agentMode, collabPartner, goalFor } from './agent';
import { animationFor, CLIP_NAMES, type Pose } from '$lib/village/animation';
import { chairOf, meetingSeats } from '$lib/village/meeting';
import { CHAIRS } from '$lib/village/layout';
import { AGENT_IDS } from '$lib/types';
import { createOrder } from '$lib/orders';
import { emptyTelemetry } from '$lib/telemetry';

describe('robot state machine', () => {
	it('is IDLE with nothing going on', () => {
		const t = emptyTelemetry();
		expect(agentMode('watchdog', t)).toBe('IDLE');
		expect(agentMode('orchestrator', t)).toBe('IDLE');
	});

	it('Watchdog alerts on a container seen going down, not on a standing outage', () => {
		const t = emptyTelemetry();
		const now = 100_000_000;
		t.containers = [{ name: 'bastion-heat', state: 'exited', restarts: 0, downSince: now - 5000 }];
		expect(agentMode('watchdog', t, now)).toBe('ALERT');
		expect(agentMode('thermal', t, now)).toBe('IDLE');
		t.containers[0].downSince = 0;
		expect(agentMode('watchdog', t, now)).toBe('IDLE');
		t.problems = [
			{
				key: 'pve|node',
				severity: 'critical',
				message: 'prob_node_offline',
				vars: {},
				since: now - 1000
			}
		];
		expect(agentMode('watchdog', t, now)).toBe('IDLE');
	});

	it('Vision alerts on fresh motion only', () => {
		const t = emptyTelemetry();
		const now = 1_000_000;
		t.cams.lastMotion = {
			id: 'r',
			camera: 'gate',
			label: 'person',
			severity: 'alert',
			zones: [],
			at: now - 5000
		};
		expect(agentMode('vision', t, now)).toBe('ALERT');
		expect(agentMode('vision', t, now + 60_000)).toBe('IDLE');
	});

	it('the Orchestrator speaks while the voice assistant does', () => {
		const t = emptyTelemetry();
		t.voice = { phase: 'answer', answer: 'Gotovo', at: 1 };
		expect(agentMode('orchestrator', t)).toBe('SPEAKING');
	});

	it('WORKING alone, COLLAB with another turn, SPEAKING while the answer streams', () => {
		const t = emptyTelemetry();
		t.agents.thermal = { ...t.agents.thermal, busy: true, state: 'busy' };
		expect(agentMode('thermal', t)).toBe('WORKING');
		t.agents.vision = { ...t.agents.vision, busy: true, state: 'busy' };
		expect(agentMode('thermal', t)).toBe('COLLAB');
		t.agents.thermal.speaking = true;
		expect(agentMode('thermal', t)).toBe('SPEAKING');
		t.agents.homekeeper = { ...t.agents.homekeeper, state: 'waiting' };
		expect(agentMode('homekeeper', t)).toBe('WORKING');
	});

	it('work orders: the brief walks over, then the app robot codes', () => {
		const t = emptyTelemetry();
		const order = createOrder('thermal', ['heat'], 'x', 1, 'o1');
		t.orders = [{ ...order, status: 'approved' }];
		expect(agentMode('orchestrator', t)).toBe('COLLAB');
		expect(collabPartner('orchestrator', t)).toBe('thermal');
		expect(agentMode('thermal', t)).toBe('COLLAB');
		expect(agentMode('vision', t)).toBe('IDLE');
		t.orders = [{ ...order, status: 'coding' }];
		expect(agentMode('thermal', t)).toBe('WORKING');
		expect(agentMode('orchestrator', t)).toBe('IDLE');
		t.orders = [{ ...order, status: 'shipping' }];
		expect(agentMode('orchestrator', t)).toBe('WORKING');
		expect(agentMode('thermal', t)).toBe('IDLE');
	});

	it('a meeting seats everyone; an ALERT gets up, runs off, and comes back', () => {
		const t = emptyTelemetry();
		const now = 100_000_000;
		for (const id of AGENT_IDS) expect(agentMode(id, t, now, true)).toBe('MEETING');
		expect(goalFor('thermal', 'MEETING', t)).toBe(chairOf('thermal').id);
		// a container goes down: the Watchdog leaves the table for the forge
		t.containers = [{ name: 'bastion-heat', state: 'exited', restarts: 0, downSince: now - 1000 }];
		expect(agentMode('watchdog', t, now, true)).toBe('ALERT');
		expect(goalFor('watchdog', 'ALERT', t)).toBe('forge_door');
		expect(agentMode('thermal', t, now, true)).toBe('MEETING');
		// it's fixed: back to its chair
		t.containers = [{ name: 'bastion-heat', state: 'running', restarts: 1 }];
		expect(agentMode('watchdog', t, now, true)).toBe('MEETING');
		// the meeting ends: back to strolling
		expect(agentMode('watchdog', t, now, false)).toBe('IDLE');
	});
});

describe('meeting seats', () => {
	it('every agent has its own chair, the Orchestrator at the head', () => {
		const seats = meetingSeats();
		expect(seats.orchestrator).toBe(0);
		expect(new Set(Object.values(seats)).size).toBe(AGENT_IDS.length);
		for (const id of AGENT_IDS) expect(chairOf(id)).toBe(CHAIRS[seats[id]]);
	});
});

describe('animations', () => {
	const pose = (over: Partial<Pose>): Pose => ({
		mode: 'IDLE',
		motion: 'still',
		seated: false,
		speaking: false,
		waving: false,
		...over
	});
	it('picks the clip for each state', () => {
		expect(animationFor(pose({}))).toBe('idle');
		expect(animationFor(pose({ motion: 'walk' }))).toBe('walk');
		expect(animationFor(pose({ mode: 'ALERT', motion: 'run' }))).toBe('run');
		expect(animationFor(pose({ mode: 'ALERT' }))).toBe('idle');
		expect(animationFor(pose({ mode: 'WORKING' }))).toBe('work');
		expect(animationFor(pose({ mode: 'SPEAKING', speaking: true }))).toBe('talk');
		expect(animationFor(pose({ mode: 'COLLAB' }))).toBe('talk');
		expect(animationFor(pose({ mode: 'MEETING', motion: 'walk' }))).toBe('walk');
		expect(animationFor(pose({ mode: 'MEETING', seated: true }))).toBe('sit');
		expect(animationFor(pose({ mode: 'MEETING', seated: true, speaking: true }))).toBe('sitTalk');
		expect(animationFor(pose({ waving: true }))).toBe('wave');
	});

	it('every clip has a name in the animation library', () => {
		for (const name of Object.values(CLIP_NAMES)) expect(name).toMatch(/^[A-Z][A-Za-z_]+$/);
	});
});
