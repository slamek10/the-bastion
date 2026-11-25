import { json } from '@sveltejs/kit';
import { updateOrder } from '$lib/server/orders';
import { OrderError } from '$lib/orders';
import type { OrderStatus } from '$lib/types';

const ACTIONS: Record<string, OrderStatus> = {
	approve: 'approved',
	changes: 'planning',
	reject: 'rejected',
	cancel: 'cancelled'
};

/** your answer to a plan (approve, ask for changes, reject) or cancelling an order */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const to = ACTIONS[String(body.action)];
	if (!to)
		return json(
			{ ok: false, error: 'action: approve, changes, reject or cancel' },
			{ status: 400 }
		);
	try {
		const order = await updateOrder(params.id, 'you', to, {
			text: typeof body.text === 'string' ? body.text : undefined
		});
		return json({ ok: true, order });
	} catch (error) {
		if (error instanceof OrderError)
			return json({ ok: false, error: error.message }, { status: 409 });
		throw error;
	}
}
