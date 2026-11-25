import { error } from '@sveltejs/kit';
import { AGENTS, agentTurn } from '$lib/server/agents';
import type { AgentId, TurnEvent } from '$lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** one turn with a robot, streamed back as NDJSON (TurnEvent per line) */
export async function POST({ params, request }) {
	if (!(params.id in AGENTS)) error(404, 'no such agent');
	const body = await request.json().catch(() => ({}));
	const message = typeof body.message === 'string' ? body.message.trim() : '';
	if (!message || message.length > 4000) error(400, 'message: 1-4000 characters');
	const session =
		typeof body.session === 'string' && UUID.test(body.session) ? body.session : undefined;

	const abort = new AbortController();
	request.signal.addEventListener('abort', () => abort.abort());
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const emit = (event: TurnEvent) => {
				try {
					controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
				} catch {
					abort.abort();
				}
			};
			try {
				await agentTurn(params.id as AgentId, message, emit, abort.signal, session);
			} finally {
				try {
					controller.close();
				} catch {
					/* gone */
				}
			}
		},
		cancel: () => abort.abort()
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform' }
	});
}
