/**
 * The shared Bastion login: this app has no login of its own. A session is
 * the bastion_session cookie every Bastion app on the server accepts (signed
 * with BASTION_SESSION_SECRET), so signing in to any of them opens this one.
 * The login form here (APP_PASSWORD) mints the same cookie.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
	SHARED_COOKIE,
	SHARED_MAX_AGE,
	createShared,
	sharedEnabled,
	sharedFromHeader,
	validShared
} from '$lib/server/bastionSession';
import { config } from '$lib/server/config';

/** what's missing for the login to work, empty when it can */
export function missingConfig() {
	return sharedEnabled() ? [] : ['BASTION_SESSION_SECRET (32+ characters)'];
}

export function hasSession(cookieHeader: string | null | undefined) {
	return sharedEnabled() && validShared(sharedFromHeader(cookieHeader));
}

// compared as digests, so the lengths always match
const digest = (value: string) => createHmac('sha256', 'the-bastion').update(value).digest();

export function checkPassword(value: unknown) {
	const wanted = config.password;
	if (!sharedEnabled() || !wanted || typeof value !== 'string') return false;
	return timingSafeEqual(digest(value), digest(wanted));
}

export const loginCookie = () => ({
	name: SHARED_COOKIE,
	value: createShared(),
	maxAge: SHARED_MAX_AGE
});

export const logoutCookies = () => [SHARED_COOKIE];
