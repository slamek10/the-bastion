import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { logoutCookies } from '$lib/server/auth';

/**
 * Signs out of the shared Bastion login, so of every Bastion app. Secure as
 * the login set it: a deletion marked Secure is ignored on plain http.
 */
export function POST({ cookies }) {
	const secure = config.publicUrl.startsWith('https:');
	for (const name of logoutCookies()) cookies.delete(name, { path: '/', secure });
	return json({ ok: true });
}
