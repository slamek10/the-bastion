import { describe, expect, it } from 'vitest';
import { parseSse } from './peers';

describe('server-sent events', () => {
	it('splits complete events and keeps the rest', () => {
		const { events, rest } = parseSse(
			'data: {"a":1}\n\n: comment\n\ndata: {"b"\ndata: :2}\n\ndata: {"c"'
		);
		expect(events).toEqual(['{"a":1}', '{"b"\n:2}']);
		expect(rest).toBe('data: {"c"');
	});

	it('handles CRLF', () => {
		expect(parseSse('data: x\r\n\r\n').events).toEqual(['x']);
	});
});
