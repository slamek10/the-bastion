/**
 * The other Bastion apps, read the way a signed-in browser would: with a
 * bastion_session cookie this server mints itself (createShared, the same
 * BASTION_SESSION_SECRET), so no app needs a new token for The Bastion.
 * Their live streams (server-sent events) are followed with reconnect and
 * backoff; each JSON `data:` line goes to the listener.
 */
import { createShared, sharedEnabled, SHARED_COOKIE } from '$lib/server/bastionSession';
import { appUrl } from '$lib/server/config';
import type { AppId, PeerState } from '$lib/types';

export class PeerError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

function headers(extra: Record<string, string> = {}) {
	return {
		...(sharedEnabled() && { Cookie: `${SHARED_COOKIE}=${encodeURIComponent(createShared())}` }),
		Accept: 'application/json',
		...extra
	};
}

/** GET (or another method) on an app's /_api/…; throws PeerError when it can't be read */
export async function peerFetch<T>(app: AppId, path: string, init: RequestInit = {}): Promise<T> {
	const base = appUrl(app);
	if (!base) throw new PeerError(0, 'not configured');
	let response: Response;
	try {
		response = await fetch(`${base}${path}`, {
			...init,
			headers: headers((init.headers as Record<string, string>) ?? {}),
			signal: init.signal ?? AbortSignal.timeout(8000)
		});
	} catch (error) {
		throw new PeerError(0, (error as Error).message);
	}
	if (!response.ok) throw new PeerError(response.status, `${app} ${path}: ${response.status}`);
	return (await response.json()) as T;
}

/**
 * Splits server-sent events out of a buffer: the complete events' data (the
 * `data:` lines of one event joined) and what's left for the next chunk.
 */
export function parseSse(buffer: string): { events: string[]; rest: string } {
	const events: string[] = [];
	const normalized = buffer.replace(/\r\n/g, '\n');
	let start = 0;
	let end: number;
	while ((end = normalized.indexOf('\n\n', start)) >= 0) {
		const block = normalized.slice(start, end);
		start = end + 2;
		const data = block
			.split('\n')
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).replace(/^ /, ''))
			.join('\n');
		if (data) events.push(data);
	}
	return { events, rest: normalized.slice(start) };
}

export interface StreamOptions {
	onMessage: (message: unknown) => void;
	onState?: (state: PeerState) => void;
	/** first wait after a failure, doubled up to maxDelay */
	minDelay?: number;
	maxDelay?: number;
}

/** follows an app's SSE stream until the returned function is called */
export function followStream(app: AppId, path: string, options: StreamOptions) {
	const { onMessage, onState = () => {}, minDelay = 1000, maxDelay = 30_000 } = options;
	let stopped = false;
	let controller: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let delay = minDelay;

	const retry = () => {
		if (stopped) return;
		onState('down');
		timer = setTimeout(run, delay);
		delay = Math.min(delay * 2, maxDelay);
	};

	async function run() {
		if (stopped) return;
		const base = appUrl(app);
		if (!base) {
			onState('not configured');
			return;
		}
		onState('connecting');
		controller = new AbortController();
		try {
			const response = await fetch(`${base}${path}`, {
				headers: headers({ Accept: 'text/event-stream' }),
				signal: controller.signal
			});
			if (!response.ok || !response.body) throw new Error(`${response.status}`);
			onState('ok');
			delay = minDelay;
			const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = '';
			while (!stopped) {
				const { value, done } = await reader.read();
				if (done) break;
				const parsed = parseSse(buffer + value);
				buffer = parsed.rest;
				for (const data of parsed.events) {
					try {
						const message = JSON.parse(data);
						if (message?.kind !== 'ping') onMessage(message);
					} catch {
						// not JSON: skipped
					}
				}
			}
		} catch {
			// down, refused, or stopped: retried below unless stopped
		}
		retry();
	}

	run();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
		controller?.abort();
	};
}
