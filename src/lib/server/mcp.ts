/**
 * This app's own tools for Claude Code (through bastion-ai), as an MCP
 * server (streamable HTTP, plain JSON answers), for the Orchestrator robot
 * and any other Bastion app's assistant: fleet_status and recent_events,
 * both reading only. A key is made for one turn (10 minutes), the same
 * scheme as Bastion Watch's: openTurn for our own turns, keyFor for a key
 * asked for with bastion-ai's token (POST /mcp/key).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hub } from '$lib/server/telemetry';
import { containerDown, problemText } from '$lib/telemetry';
import type { Telemetry } from '$lib/types';

const TTL = 10 * 60_000;
export const SERVER_NAME = 'bastion';

const global = globalThis as unknown as { __bastionMcp?: Map<string, number> };
const keys = (global.__bastionMcp ??= new Map());

/** a key for one turn; close() forgets it when the turn ends */
export function openTurn(now = Date.now()) {
	for (const [key, expires] of keys) if (expires <= now) keys.delete(key);
	const key = randomBytes(24).toString('base64url');
	keys.set(key, now + TTL);
	return { key, close: () => keys.delete(key) };
}

function same(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

function validKey(header: string | null, now = Date.now()) {
	const given = header?.match(/^Bearer\s+(\S+)$/)?.[1];
	if (!given) return false;
	for (const [key, expires] of keys) if (expires > now && same(key, given)) return true;
	return false;
}

/** a key for bastion-ai's token holder; undefined when the token is wrong */
export function keyFor(authorization: string | null) {
	const wanted = process.env.BASTION_AI_TOKEN || '';
	const given = authorization?.match(/^Bearer\s+(\S+)$/)?.[1] ?? '';
	if (wanted.length < 16 || !same(given, wanted)) return undefined;
	return openTurn().key;
}

/** fleet_status's text: what the robots see, short */
export function fleetSummary(t: Telemetry) {
	const down = t.containers.filter(containerDown);
	const lines = [
		`Apps: ${Object.entries(t.peers)
			.map(([peer, state]) => `${peer} ${state}`)
			.join(', ')}`,
		`Containers: ${t.containers.length} seen, ${down.length} not fine${
			down.length
				? ` (${down.map((c) => `${c.name} ${c.state}${c.health ? `/${c.health}` : ''}`).join(', ')})`
				: ''
		}`,
		`Problems: ${t.problems.length ? t.problems.map((p) => `[${p.severity}] ${problemText(p)}`).join('; ') : 'none'}`,
		`Heating: ${
			t.heat.active
				? `on in ${t.heat.rooms
						.filter((r) => r.calling)
						.map((r) => r.roomId)
						.join(', ')}`
				: 'off'
		}${t.heat.alerts ? `, ${t.heat.alerts} alerts` : ''}`,
		`Cameras: ${t.cams.lastMotion ? `last ${t.cams.lastMotion.label} at ${t.cams.lastMotion.camera}, ${new Date(t.cams.lastMotion.at).toISOString()}` : 'no motion seen since start'}`,
		`Voice: ${t.voice.phase}${t.voice.heard ? `, last heard “${t.voice.heard}”` : ''}`,
		`Work orders: ${t.orders.length ? t.orders.map((o) => `${o.id} ${o.status}`).join(', ') : 'none'}`,
		`Agents: ${Object.entries(t.agents)
			.map(([id, a]) => `${id} ${a.state}${a.available ? '' : ' (unavailable)'}`)
			.join(', ')}`,
		`Home Assistant: ${Object.keys(t.ha).length} entities, lights on: ${
			Object.values(t.ha).filter((e) => e.entity_id.startsWith('light.') && e.state === 'on').length
		}`
	];
	return lines.join('\n');
}

const TOOLS = [
	{
		name: 'fleet_status',
		description:
			'The Bastion fleet now: which apps answer, Docker containers that are not fine, Watch problems, heating, last camera motion, the voice assistant and the robots.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false }
	},
	{
		name: 'work_orders',
		description:
			'The change requests filed through The Bastion: what was asked, for which app, where each one is (planning, waiting for approval, coding, shipping, deployed…), the plan and the commits.',
		inputSchema: {
			type: 'object',
			properties: { id: { type: 'string', description: 'one order in full; leave out for all' } },
			additionalProperties: false
		}
	},
	{
		name: 'recent_events',
		description: 'The latest things that happened across the Bastion apps, newest first.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'number', description: '1-100, default 30' } },
			additionalProperties: false
		}
	}
];

export function runTool(name: string, input: Record<string, unknown>) {
	if (name === 'fleet_status') return { text: fleetSummary(hub.state) };
	// read only: filing, approving and building orders happen in the HUD and on the Mac
	if (name === 'work_orders') {
		const orders = hub.state.orders;
		if (typeof input.id === 'string') {
			const order = orders.find((o) => o.id === input.id);
			if (!order)
				return { text: 'No such order (only open ones and the last 10 finished are here).' };
			return {
				text: [
					`${order.id} [${order.status}] for ${order.apps.join(', ') || 'any app'}: ${order.request}`,
					order.plan ? `Plan:\n${order.plan}` : 'No plan yet.',
					order.feedback ? `Changes asked: ${order.feedback}` : '',
					...order.commits.map((c) => `Commit ${c.app} ${c.branch} ${c.commit}: ${c.summary}`),
					'Log:',
					...order.log.map((l) => `${new Date(l.at).toISOString()} ${l.by}: ${l.text}`)
				]
					.filter(Boolean)
					.join('\n')
			};
		}
		return {
			text:
				orders
					.map(
						(o) =>
							`${o.id} [${o.status}] ${o.apps.join(', ') || 'any app'}: ${o.request.slice(0, 120)}`
					)
					.join('\n') || 'No work orders.'
		};
	}
	if (name === 'recent_events') {
		const limit = Math.max(1, Math.min(100, Number(input.limit) || 30));
		const lines = hub.events
			.slice(0, limit)
			.map((e) => `${new Date(e.at).toISOString()} [${e.source}/${e.level}] ${e.text}`);
		return { text: lines.join('\n') || 'Nothing yet.' };
	}
	return { text: `unknown tool ${name}`, isError: true };
}

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method?: string; params?: any };

const answer = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const failure = (id: Rpc['id'], code: number, message: string) => ({
	jsonrpc: '2.0',
	id,
	error: { code, message }
});

function handle(message: Rpc) {
	switch (message.method) {
		case 'initialize':
			return answer(message.id, {
				protocolVersion:
					typeof message.params?.protocolVersion === 'string'
						? message.params.protocolVersion
						: '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'the-bastion', version: '1' }
			});
		case 'ping':
			return answer(message.id, {});
		case 'tools/list':
			return answer(message.id, { tools: TOOLS });
		case 'tools/call': {
			const result = runTool(String(message.params?.name ?? ''), message.params?.arguments ?? {});
			return answer(message.id, {
				content: [{ type: 'text', text: result.text }],
				isError: !!result.isError
			});
		}
		default:
			return message.id === undefined
				? undefined
				: failure(message.id, -32601, `unknown method ${message.method}`);
	}
}

export async function mcpRequest(request: Request) {
	if (!validKey(request.headers.get('authorization')))
		return new Response('Unauthorized', { status: 401 });
	let body: Rpc | Rpc[];
	try {
		body = await request.json();
	} catch {
		return Response.json(failure(null, -32700, 'parse error'), { status: 400 });
	}
	const list = Array.isArray(body) ? body : [body];
	const out = list.map(handle).filter(Boolean);
	if (!out.length) return new Response(null, { status: 202 });
	return Response.json(Array.isArray(body) ? out : out[0]);
}
