import { json } from '@sveltejs/kit';
import { cameraStream, ServiceError } from '$lib/server/ha';

/**
 * A live HLS stream of a camera: Home Assistant makes it, and the browser
 * plays it through this app (/hls/… proxied to HA in server.js), so there's
 * no mixed content and no token in the browser.
 */
export async function POST({ request }) {
	const { entity_id } = await request.json().catch(() => ({}));
	try {
		const path = await cameraStream(String(entity_id ?? ''));
		return json({ ok: true, url: `/hls${path}` });
	} catch (error) {
		const status = error instanceof ServiceError ? 400 : 502;
		const message = (error as { message?: string })?.message ?? String(error);
		return json({ ok: false, error: message }, { status });
	}
}
