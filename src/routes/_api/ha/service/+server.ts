import { json } from '@sveltejs/kit';
import { checkServiceCall, runService, ServiceError } from '$lib/server/ha';
import { hub } from '$lib/server/telemetry';

/** a Home Assistant service from a HUD button: allowed domains only, entities of that domain */
export async function POST({ request }) {
	let call;
	try {
		call = checkServiceCall(await request.json().catch(() => undefined));
	} catch (error) {
		return json({ ok: false, error: (error as Error).message }, { status: 400 });
	}
	try {
		const result = await runService(call);
		hub.event('ha', 'info', `${call.domain}.${call.service} → ${call.entity_id.join(', ')}`);
		return json({ ok: true, result: result ?? null });
	} catch (error) {
		const status = error instanceof ServiceError ? 503 : 502;
		const message = (error as { message?: string })?.message ?? String(error);
		return json({ ok: false, error: message }, { status });
	}
}
