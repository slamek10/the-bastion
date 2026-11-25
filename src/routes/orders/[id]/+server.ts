import { json } from '@sveltejs/kit';
import { forOrchestrator, getOrder, orchestratorAuthorized, updateOrder } from '$lib/server/orders';
import { cleanTargets, OrderError } from '$lib/orders';
import { config } from '$lib/server/config';
import type { OrderCommit, OrderStatus } from '$lib/types';

function gate(request: Request) {
	if (!config.ordersToken) return new Response('ORDERS_TOKEN not configured', { status: 503 });
	if (!orchestratorAuthorized(request.headers.get('authorization')))
		return new Response('Unauthorized', { status: 401 });
	return undefined;
}

export async function GET({ params, request }) {
	const refused = gate(request);
	if (refused) return refused;
	const order = await getOrder(params.id);
	return order ? json(forOrchestrator(order)) : json({ error: 'no such order' }, { status: 404 });
}

/**
 * The orchestrator reports: { status?, text?, plan?, apps?, commit? }.
 * Without status it's a note in the log. It can never approve.
 */
export async function POST({ params, request }) {
	const refused = gate(request);
	if (refused) return refused;
	const body = await request.json().catch(() => ({}));
	try {
		const order = await updateOrder(
			params.id,
			'orchestrator',
			typeof body.status === 'string' ? (body.status as OrderStatus) : undefined,
			{
				text: typeof body.text === 'string' ? body.text : undefined,
				plan: typeof body.plan === 'string' ? body.plan : undefined,
				apps: body.apps === undefined ? undefined : cleanTargets(body.apps),
				commit:
					body.commit && typeof body.commit === 'object' ? (body.commit as OrderCommit) : undefined
			}
		);
		return json(forOrchestrator(order));
	} catch (error) {
		if (error instanceof OrderError) return json({ error: error.message }, { status: 409 });
		throw error;
	}
}
