import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '';
beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'bastion-orders-'));
	process.env.DATA_DIR = dir;
	process.env.ORDERS_TOKEN = 'o'.repeat(40);
});
afterAll(async () => {
	delete process.env.DATA_DIR;
	delete process.env.ORDERS_TOKEN;
	await rm(dir, { recursive: true, force: true });
});

describe('orders on the server', () => {
	it('files, streams, refuses the orchestrator approving, saves', async () => {
		const { fileOrder, updateOrder, onOrder, orchestratorAuthorized, forOrchestrator } =
			await import('./orders');
		const { hub } = await import('./telemetry');
		const seen: string[] = [];
		const stop = onOrder((order) => seen.push(`${order.id}:${order.status}`));

		const order = await fileOrder('thermal', ['heat'], 'show flow temperature');
		expect(forOrchestrator(order)).toMatchObject({ action: 'plan', repos: ['bastion-heat'] });
		await updateOrder(order.id, 'orchestrator', 'planning');
		await updateOrder(order.id, 'orchestrator', 'awaiting_approval', { plan: 'the plan' });
		await expect(updateOrder(order.id, 'orchestrator', 'approved')).rejects.toThrow();
		await updateOrder(order.id, 'you', 'approved');
		stop();

		expect(seen).toEqual([
			`${order.id}:new`,
			`${order.id}:planning`,
			`${order.id}:awaiting_approval`,
			`${order.id}:approved`
		]);
		expect(hub.state.orders[0]).toMatchObject({ id: order.id, status: 'approved' });
		const saved = JSON.parse(await readFile(join(dir, 'orders.json'), 'utf8'));
		expect(saved[0].status).toBe('approved');

		expect(orchestratorAuthorized(`Bearer ${'o'.repeat(40)}`)).toBe(true);
		expect(orchestratorAuthorized('Bearer nope')).toBe(false);
		expect(orchestratorAuthorized(null)).toBe(false);
	});
});
