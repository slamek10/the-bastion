import { json } from '@sveltejs/kit';
import { forOrchestrator, listOrders, orchestratorAuthorized } from '$lib/server/orders';
import { config } from '$lib/server/config';
import { ORDER_DONE } from '$lib/types';

/**
 * The orchestrator session's view of the work orders (Bearer ORDERS_TOKEN).
 * ?open=1: only those not finished; ?action=1: only those waiting on it.
 */
export async function GET({ request, url }) {
	if (!config.ordersToken) return new Response('ORDERS_TOKEN not configured', { status: 503 });
	if (!orchestratorAuthorized(request.headers.get('authorization')))
		return new Response('Unauthorized', { status: 401 });
	let orders = (await listOrders()).map(forOrchestrator);
	if (url.searchParams.has('open')) orders = orders.filter((o) => !ORDER_DONE.includes(o.status));
	if (url.searchParams.has('action')) orders = orders.filter((o) => o.action);
	return json(orders);
}
