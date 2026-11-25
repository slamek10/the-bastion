import { describe, expect, it } from 'vitest';
import {
	applyMessage,
	camEvent,
	containersFromWatch,
	diffTelemetry,
	emptyTelemetry,
	heatFromBrain,
	problemsFromWatch,
	problemText,
	voiceFrom,
	type WatchSnapshot
} from './telemetry';

const snapshot = (containers: NonNullable<WatchSnapshot['data']>['containers']): WatchSnapshot => ({
	deviceId: 'docker',
	at: 1,
	ok: true,
	data: { kind: 'docker', containers }
});

describe('Watch → containers', () => {
	it('reads docker snapshots and skips other devices', () => {
		const list = containersFromWatch([
			snapshot([
				{ name: 'bastion-watch', state: 'running', health: 'healthy', status: 'Up 2 hours' },
				{ name: 'frigate', state: 'exited', status: 'Exited (1)' }
			]),
			{ deviceId: 'unifi', at: 1, ok: true, data: { kind: 'unifi' } }
		]);
		expect(list).toEqual([
			{
				name: 'bastion-watch',
				state: 'running',
				health: 'healthy',
				status: 'Up 2 hours',
				restarts: 0,
				app: 'watch'
			},
			{ name: 'frigate', state: 'exited', status: 'Exited (1)', restarts: 0, app: 'cams' }
		]);
	});

	it('counts going into restarting once', () => {
		let list = containersFromWatch([snapshot([{ name: 'bastion-ai', state: 'running' }])]);
		list = containersFromWatch([snapshot([{ name: 'bastion-ai', state: 'restarting' }])], list);
		list = containersFromWatch([snapshot([{ name: 'bastion-ai', state: 'restarting' }])], list);
		expect(list[0].restarts).toBe(1);
		list = containersFromWatch([snapshot([{ name: 'bastion-ai', state: 'running' }])], list);
		list = containersFromWatch([snapshot([{ name: 'bastion-ai', state: 'restarting' }])], list);
		expect(list[0].restarts).toBe(2);
	});

	it('finds the container of a problem', () => {
		const [problem] = problemsFromWatch([
			{
				key: 'docker|container|bastion-heat',
				deviceId: 'docker',
				severity: 'critical',
				message: 'prob_container_exited',
				vars: { name: 'bastion-heat', code: '137' },
				since: 5
			}
		]);
		expect(problem.container).toBe('bastion-heat');
		expect(problemText(problem)).toBe('bastion-heat exited (137)');
	});
});

describe('diffs', () => {
	it('carries only what changed and applies back to the same state', () => {
		const before = emptyTelemetry(1);
		before.ha = {
			'light.a': { entity_id: 'light.a', state: 'off', attributes: {}, last_changed: 't1' },
			'light.b': { entity_id: 'light.b', state: 'on', attributes: {}, last_changed: 't1' }
		};
		const after = {
			...before,
			at: 2,
			heat: { ...before.heat, active: true },
			ha: {
				'light.a': { entity_id: 'light.a', state: 'on', attributes: {}, last_changed: 't2' },
				'light.c': { entity_id: 'light.c', state: 'on', attributes: {}, last_changed: 't2' }
			}
		};
		const diff = diffTelemetry(before, after)!;
		expect(Object.keys(diff.set ?? {})).toEqual(['heat']);
		expect(Object.keys(diff.ha!.changed).sort()).toEqual(['light.a', 'light.c']);
		expect(diff.ha!.removed).toEqual(['light.b']);
		expect(applyMessage(before, diff)).toEqual(after);
	});

	it('is nothing when nothing changed', () => {
		const state = emptyTelemetry(1);
		expect(diffTelemetry(state, { ...state, at: 9 })).toBeUndefined();
	});

	it('takes a snapshot whole', () => {
		const state = emptyTelemetry(3);
		expect(
			applyMessage(emptyTelemetry(1), { type: 'snapshot', telemetry: state, events: [] })
		).toBe(state);
	});
});

describe('other apps', () => {
	it('heat is active when a room calls', () => {
		const heat = heatFromBrain(
			{ enabled: true, plans: [{ roomId: 'ured', target: 21, calling: true }] },
			2,
			7
		);
		expect(heat).toEqual({
			active: true,
			enabled: true,
			rooms: [{ roomId: 'ured', target: 21, calling: true }],
			alerts: 2,
			at: 7
		});
	});

	it('a Cams review in seconds becomes an event in ms', () => {
		const event = camEvent({
			id: 'r',
			camera: 'gate',
			start_time: 1_700_000_000.5,
			severity: 'alert',
			data: { objects: ['person'], zones: ['gate'] }
		});
		expect(event).toEqual({
			id: 'r',
			camera: 'gate',
			label: 'person',
			severity: 'alert',
			zones: ['gate'],
			at: 1_700_000_000_500
		});
	});

	it('voice goes heard → answer → idle, and nothing heard is idle', () => {
		let voice = voiceFrom(
			{ phase: 'idle', at: 0 },
			{ kind: 'heard', text: 'upali svjetlo', at: 1 }
		);
		voice = voiceFrom(voice, { kind: 'answer', text: 'Gotovo.', at: 2 });
		expect(voice).toEqual({ phase: 'answer', heard: 'upali svjetlo', answer: 'Gotovo.', at: 2 });
		expect(voiceFrom(voice, { kind: 'heard', text: '  ', at: 3 }).phase).toBe('idle');
	});
});
