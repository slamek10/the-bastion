import { json } from '@sveltejs/kit';
import { loadBindings, saveBindings } from '$lib/server/bindings';

export const GET = async () => json(await loadBindings());

export async function PUT({ request }) {
	const body = await request.json().catch(() => undefined);
	return json(await saveBindings(body));
}
