import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	SHARED_COOKIE,
	SHARED_MAX_AGE,
	createShared,
	sharedEnabled,
	sharedFromHeader,
	validShared
} from './bastionSession';

const SECRET = 'x'.repeat(40);

describe('the shared Bastion session', () => {
	let saved: string | undefined;
	beforeEach(() => {
		saved = process.env.BASTION_SESSION_SECRET;
		process.env.BASTION_SESSION_SECRET = SECRET;
	});
	afterEach(() => {
		if (saved === undefined) delete process.env.BASTION_SESSION_SECRET;
		else process.env.BASTION_SESSION_SECRET = saved;
	});

	it('round-trips a cookie it made', () => {
		expect(sharedEnabled()).toBe(true);
		const value = createShared();
		expect(validShared(value)).toBe(true);
		expect(sharedFromHeader(`a=b; ${SHARED_COOKIE}=${encodeURIComponent(value)}; c=d`)).toBe(value);
	});

	it('refuses a changed, expired or foreign cookie', () => {
		const value = createShared();
		const last = value.slice(-1) === '0' ? '1' : '0';
		expect(validShared(value.slice(0, -1) + last)).toBe(false);
		expect(validShared(createShared(Date.now() - (SHARED_MAX_AGE + 5) * 1000))).toBe(false);
		process.env.BASTION_SESSION_SECRET = 'y'.repeat(40);
		expect(validShared(value)).toBe(false);
	});

	it('is off without a long enough secret', () => {
		process.env.BASTION_SESSION_SECRET = 'short';
		expect(sharedEnabled()).toBe(false);
		expect(validShared(createShared())).toBe(false);
	});
});
