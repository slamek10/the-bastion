import { hub } from '$lib/server/telemetry';
import type { TelemetryMessage } from '$lib/types';

/** server-sent events: the whole aggregate first, then diffs and feed events as they happen */
export function GET({ request }) {
	let stop = () => {};
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (message: TelemetryMessage) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
				} catch {
					stop();
				}
			};
			const unsubscribe = hub.subscribe(send);
			// keeps proxies from closing a quiet connection
			const ping = setInterval(() => send({ type: 'ping' }), 25_000);
			stop = () => {
				clearInterval(ping);
				unsubscribe();
			};
			request.signal.addEventListener('abort', () => {
				stop();
				try {
					controller.close();
				} catch {
					/* already closed */
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
