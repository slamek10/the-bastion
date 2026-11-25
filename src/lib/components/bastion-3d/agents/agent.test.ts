import { describe, expect, it } from 'vitest';
import { agentMode } from './agent';
import { emptyTelemetry } from '$lib/telemetry';

describe('robot state machine', () => {
	it('is IDLE with nothing going on', () => {
		const t = emptyTelemetry();
		expect(agentMode('watchdog', t)).toBe('IDLE');
		expect(agentMode('orchestrator', t)).toBe('IDLE');
	});

	it('Watchdog alerts on a container that is down', () => {
		const t = emptyTelemetry();
		t.containers = [{ name: 'bastion-heat', state: 'exited', restarts: 0 }];
		expect(agentMode('watchdog', t)).toBe('ALERT');
		expect(agentMode('thermal', t)).toBe('IDLE');
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
});
