import { forOrchestrator, listOrders, onOrder, orchestratorAuthorized } from '$lib/server/orders';
import { config } from '$lib/server/config';

/**
 * Server-sent events for the orchestrator session (Bearer ORDERS_TOKEN): on
 * connect, every order waiting on it; then each change to any order, one
 * `data:` line each, with `action` (plan, replan, build) when it's its turn.
 * Meant for Claude Code's Monitor: curl -sN … | grep --line-buffered '^data:'
 */
export async function GET({ request }) {
	if (!config.ordersToken) return new Response('ORDERS_TOKEN not configured', { status: 503 });
	if (!orchestratorAuthorized(request.headers.get('authorization')))
		return new Response('Unauthorized', { status: 401 });
	const waiting = (await listOrders()).map(forOrchestrator).filter((order) => order.action);
	let stop = () => {};
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					stop();
				}
			};
			// short lines: the full order is at GET /orders/:id
			const brief = (order: ReturnType<typeof forOrchestrator>) => ({
				id: order.id,
				status: order.status,
				action: order.action,
				repos: order.repos,
				request: order.request.slice(0, 300),
				...(order.feedback && { feedback: order.feedback.slice(0, 300) })
			});
			for (const order of waiting) send(brief(order));
			const unsubscribe = onOrder((order) => send(brief(forOrchestrator(order))));
			const ping = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					stop();
				}
			}, 25_000);
			stop = () => {
				clearInterval(ping);
				unsubscribe();
			};
			request.signal.addEventListener('abort', () => {
				stop();
				try {
					controller.close();
				} catch {
					/* closed */
				}
			});
		},
		cancel: () => stop()
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}
