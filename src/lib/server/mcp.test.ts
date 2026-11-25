import { afterEach, describe, expect, it } from 'vitest';
import { fleetSummary, keyFor, mcpRequest, openTurn } from './mcp';
import { emptyTelemetry } from '$lib/telemetry';

const rpc = (key: string, body: unknown) =>
	new Request('http://x/mcp', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

describe('own MCP', () => {
	afterEach(() => delete process.env.BASTION_AI_TOKEN);

	it('lists the reading tools with a turn key, and refuses without', async () => {
		const { key, close } = openTurn();
		const response = await mcpRequest(rpc(key, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
		const body = await response.json();
		expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
			'fleet_status',
			'work_orders',
			'recent_events'
		]);
		close();
		expect(
			(await mcpRequest(rpc(key, { jsonrpc: '2.0', id: 2, method: 'tools/list' }))).status
		).toBe(401);
	});

	it('gives a key only for bastion-ai token', () => {
		process.env.BASTION_AI_TOKEN = 't'.repeat(40);
		expect(keyFor(`Bearer ${'t'.repeat(40)}`)).toMatch(/^[\w-]{20,}$/);
		expect(keyFor('Bearer wrong')).toBeUndefined();
		expect(keyFor(null)).toBeUndefined();
	});

	it('summarizes the fleet', () => {
		const t = emptyTelemetry();
		t.containers = [{ name: 'frigate', state: 'exited', restarts: 0 }];
		expect(fleetSummary(t)).toContain('1 not fine (frigate exited)');
	});
});
