import { json } from '@sveltejs/kit';
import { fileOrder } from '$lib/server/orders';
import { cleanTargets, OrderError } from '$lib/orders';
import { AGENT_IDS, type AgentId } from '$lib/types';

/** you file a change request through a robot */
export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const from = AGENT_IDS.includes(body.from) ? (body.from as AgentId) : 'orchestrator';
	try {
		const order = await fileOrder(from, cleanTargets(body.targets), String(body.request ?? ''));
		return json({ ok: true, order });
	} catch (error) {
		if (error instanceof OrderError)
			return json({ ok: false, error: error.message }, { status: 400 });
		throw error;
	}
}
