import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoSimulator } from './demo';
import { applyMessage, emptyTelemetry } from './telemetry';
import { AGENT_IDS, type Telemetry, type TelemetryMessage } from './types';

/** the shape every Telemetry must have */
function assertTelemetry(t: Telemetry) {
	const keys = Object.keys(emptyTelemetry()).sort();
	expect(Object.keys(t).sort()).toEqual(keys);
	for (const container of t.containers) {
		expect(typeof container.name).toBe('string');
		expect(typeof container.state).toBe('string');
		expect(typeof container.restarts).toBe('number');
	}
	for (const problem of t.problems) expect(['warning', 'critical']).toContain(problem.severity);
	expect(['idle', 'wake', 'heard', 'routed', 'answer', 'speaking']).toContain(t.voice.phase);
	expect(typeof t.heat.active).toBe('boolean');
	for (const id of AGENT_IDS)
		expect(['idle', 'waiting', 'busy', 'error']).toContain(t.agents[id].state);
	for (const [id, entity] of Object.entries(t.ha)) expect(entity.entity_id).toBe(id);
}

describe('demo simulator', () => {
	afterEach(() => vi.useRealTimers());

	it('emits a valid snapshot and valid diffs, and every agent changes state', () => {
		vi.useFakeTimers();
		const messages: TelemetryMessage[] = [];
		let seed = 1;
		const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		const demo = new DemoSimulator((message) => messages.push(message), random);
		demo.start(1000);
		expect(messages[0].type).toBe('snapshot');

		let state = emptyTelemetry();
		const seen = new Map(AGENT_IDS.map((id) => [id, new Set<string>()]));
		const follow = () => {
			for (const message of messages.splice(0)) {
				state = applyMessage(state, message);
				assertTelemetry(state);
				for (const id of AGENT_IDS) seen.get(id)!.add(state.agents[id].state);
			}
		};
		follow();
		for (const kind of ['containerDown', 'motion', 'heatingOn', 'voice'] as const)
			demo.trigger(kind);
		// every pair of agents gets turns, so each one is busy at some point
		for (let i = 0; i < 12; i++) {
			demo.trigger('agents');
			vi.advanceTimersByTime(7000);
			follow();
		}
		vi.advanceTimersByTime(60_000);
		follow();
		demo.stop();

		for (const id of AGENT_IDS) expect(seen.get(id)!.has('busy')).toBe(true);
		// the container outage cleared; only the standing demo problem is left
		expect(state.problems.filter((p) => p.container)).toHaveLength(0);
		expect(state.cams.lastMotion).toBeDefined();
		expect(state).toEqual(demo.state);
	});

	it('a container going down raises a problem, then clears', () => {
		vi.useFakeTimers();
		const demo = new DemoSimulator(() => {});
		demo.trigger('containerDown');
		expect(demo.state.problems.filter((p) => p.container)).toHaveLength(1);
		expect(demo.state.containers.some((c) => c.state === 'exited')).toBe(true);
		vi.advanceTimersByTime(13_000);
		expect(demo.state.problems.filter((p) => p.container)).toHaveLength(0);
		demo.stop();
	});

	it('a service call changes the entity', () => {
		const demo = new DemoSimulator(() => {});
		const before = demo.state.ha['light.demo_garden'].state;
		demo.service('light', 'toggle', 'light.demo_garden');
		expect(demo.state.ha['light.demo_garden'].state).not.toBe(before);
		demo.service('cover', 'close_cover', 'cover.demo_studio_left');
		expect(demo.state.ha['cover.demo_studio_left'].attributes.current_position).toBe(0);
	});

	it('plays an order through: plan, your approval, deployed', () => {
		vi.useFakeTimers();
		const demo = new DemoSimulator(() => {});
		demo.fileOrder('thermal', ['heat'], 'show the flow temperature');
		const id = demo.state.orders[0].id;
		vi.advanceTimersByTime(6000);
		expect(demo.state.orders[0].status).toBe('awaiting_approval');
		expect(demo.state.orders[0].plan).toContain('bastion-heat');
		// waits for you
		vi.advanceTimersByTime(30_000);
		expect(demo.state.orders[0].status).toBe('awaiting_approval');
		expect(demo.answerOrder(id, 'approve').ok).toBe(true);
		vi.advanceTimersByTime(20_000);
		expect(demo.state.orders[0].status).toBe('deployed');
		expect(demo.state.orders[0].commits).toHaveLength(1);
		demo.stop();
	});
});
