import { hasSession, missingConfig } from '$lib/server/auth';
import { config } from '$lib/server/config';

export function load({ request }) {
	const missing = missingConfig();
	return {
		/** no shared login configured: only the demo can run */
		configured: missing.length === 0,
		missing,
		needsLogin: missing.length === 0 && !hasSession(request.headers.get('cookie')),
		passwordLogin: !!config.password,
		dev: process.env.NODE_ENV !== 'production'
	};
}
