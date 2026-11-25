import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { hasSession, missingConfig } from '$lib/server/auth';
import { startTelemetry } from '$lib/server/telemetry';
import { checkAvailability } from '$lib/server/agents';

if (!building) {
	startTelemetry();
	checkAvailability().catch(() => {});
	setInterval(() => checkAvailability().catch(() => {}), 10 * 60_000).unref?.();
}

const OPEN = ['/_api/health', '/_api/login'];

function sameHost(origin: string, host: string | null) {
	try {
		return !!host && new URL(origin).host === host;
	} catch {
		return false;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (pathname.startsWith('/_api/') && !OPEN.includes(pathname)) {
		if (missingConfig().length) return new Response('Not configured', { status: 503 });
		if (!hasSession(event.request.headers.get('cookie'))) {
			return new Response('Unauthorized', { status: 401 });
		}
		// changes come only from this app's own pages. Compared by host: behind
		// adapter-node without ORIGIN, event.url says https even on plain http
		const origin = event.request.headers.get('origin');
		if (
			event.request.method !== 'GET' &&
			(!origin || !sameHost(origin, event.request.headers.get('host')))
		) {
			return new Response('Forbidden', { status: 403 });
		}
	}
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
