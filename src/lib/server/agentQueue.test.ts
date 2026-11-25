import { describe, expect, it } from 'vitest';
import { TurnQueue } from './agentQueue';

function gate() {
	let open = () => {};
	const promise = new Promise<void>((resolve) => (open = resolve));
	return { promise, open };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('agent turn queue', () => {
	it('runs two at once and one per agent', async () => {
		const queue = new TurnQueue(2);
		const started: string[] = [];
		const gates = new Map<string, ReturnType<typeof gate>>();
		const job = (name: string) => async () => {
			started.push(name);
			const g = gate();
			gates.set(name, g);
			await g.promise;
		};
		const waits: Record<string, number[]> = {};
		const run = (key: string, name: string) =>
			queue.run(key, job(name), { onWaiting: (position) => (waits[name] ??= []).push(position) });

		const done = [
			run('watchdog', 'w1'),
			run('watchdog', 'w2'),
			run('vision', 'v1'),
			run('thermal', 't1')
		];
		await tick();
		// w2 waits for w1 (same agent); t1 waits for a slot
		expect(started).toEqual(['w1', 'v1']);
		expect(queue.active.sort()).toEqual(['vision', 'watchdog']);
		expect(queue.queued).toEqual(['watchdog', 'thermal']);
		expect(waits.t1?.at(-1)).toBe(2);

		gates.get('v1')!.open();
		await tick();
		await tick();
		// the slot goes to thermal: watchdog is still busy with w1
		expect(started).toEqual(['w1', 'v1', 't1']);

		gates.get('w1')!.open();
		await tick();
		await tick();
		expect(started).toEqual(['w1', 'v1', 't1', 'w2']);
		gates.get('t1')!.open();
		gates.get('w2')!.open();
		await Promise.all(done);
		expect(queue.active).toEqual([]);
	});

	it('a waiting job can be taken back', async () => {
		const queue = new TurnQueue(1);
		const g = gate();
		const first = queue.run('a', () => g.promise);
		let ran = false;
		const job = async () => {
			ran = true;
		};
		const second = queue.run('b', job);
		expect(queue.cancel('b', job)).toBe(true);
		await second;
		g.open();
		await first;
		expect(ran).toBe(false);
	});

	it('a failing job frees its slot and rejects', async () => {
		const queue = new TurnQueue(1);
		await expect(queue.run('a', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
			'boom'
		);
		let ran = false;
		await queue.run('a', async () => {
			ran = true;
		});
		expect(ran).toBe(true);
	});
});
