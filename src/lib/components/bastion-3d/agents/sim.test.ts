import { describe, expect, it } from 'vitest';
import { AgentActor } from './agent';
import { Disposer } from '../disposer';
import { emptyTelemetry } from '$lib/telemetry';
import { emptyBindings } from '$lib/bindings';
import { chairOf } from '$lib/village/meeting';
import { AGENT_IDS } from '$lib/types';
import type { FrameContext } from '../scene/common';

/** the five walkers, stepped like the render loop does (no models: their placeholders) */
function village() {
	const d = new Disposer();
	const actors = AGENT_IDS.map((id) => new AgentActor(id, d, () => 0.5));
	const ctx: FrameContext = {
		t: emptyTelemetry(),
		bindings: emptyBindings(),
		time: 0,
		day: 1,
		glow: 0,
		agentsBusy: false,
		camera: { x: 0, y: 30, z: 30 },
		openTownHall: true
	};
	const run = (seconds: number, meeting: boolean) => {
		for (let i = 0; i < seconds * 10; i++)
			for (const a of actors) a.update(0.1, ctx, actors, meeting);
	};
	const atChair = (a: AgentActor) => {
		const chair = chairOf(a.id);
		return (
			Math.hypot(a.root.position.x - chair.x, a.root.position.z - chair.z) < 0.01 &&
			a.clip === 'sit'
		);
	};
	return { actors, ctx, run, atChair, dispose: () => d.dispose() };
}

describe('the meeting, walked', () => {
	it('everyone sits in their own chair within 20 s', () => {
		const v = village();
		v.run(20, true);
		for (const a of v.actors) expect(v.atChair(a), a.id).toBe(true);
		v.dispose();
	});

	it('an alerted agent runs to its building and comes back to its chair', () => {
		const v = village();
		v.run(20, true);
		const watchdog = v.actors.find((a) => a.id === 'watchdog')!;
		v.ctx.t = {
			...v.ctx.t,
			containers: [{ name: 'x', state: 'exited', restarts: 0, downSince: Date.now() }]
		};
		v.run(15, true);
		expect(watchdog.mode).toBe('ALERT');
		expect(Math.hypot(watchdog.root.position.x + 20, watchdog.root.position.z + 9.3)).toBeLessThan(
			0.1
		);
		v.ctx.t = { ...v.ctx.t, containers: [] };
		v.run(20, true);
		expect(v.atChair(watchdog)).toBe(true);
		v.dispose();
	});

	it('after the meeting they stroll off', () => {
		const v = village();
		v.run(20, true);
		v.run(30, false);
		expect(v.actors.filter((a) => v.atChair(a))).toHaveLength(0);
		v.dispose();
	});
});
