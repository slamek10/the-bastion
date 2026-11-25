import { describe, expect, it } from 'vitest';
import { checkServiceCall, keepEntity, ServiceError } from './ha';

describe('service allowlist', () => {
	it('lets an allowed domain through, with its own entities', () => {
		expect(
			checkServiceCall({ domain: 'light', service: 'toggle', entity_id: 'light.kitchen' })
		).toEqual({
			domain: 'light',
			service: 'toggle',
			entity_id: ['light.kitchen'],
			data: {}
		});
		expect(
			checkServiceCall({
				domain: 'cover',
				service: 'set_cover_position',
				entity_id: ['cover.a', 'cover.b'],
				data: { position: 40 }
			}).entity_id
		).toEqual(['cover.a', 'cover.b']);
	});

	it('refuses other domains', () => {
		for (const domain of [
			'lock',
			'alarm_control_panel',
			'homeassistant',
			'shell_command',
			'notify',
			''
		])
			expect(() =>
				checkServiceCall({ domain, service: 'turn_on', entity_id: `${domain}.x` })
			).toThrow(ServiceError);
	});

	it('refuses an entity outside the domain', () => {
		expect(() =>
			checkServiceCall({ domain: 'light', service: 'turn_on', entity_id: 'lock.front_door' })
		).toThrow(/not a light/);
		expect(() =>
			checkServiceCall({ domain: 'switch', service: 'turn_on', entity_id: ['switch.a', 'lock.b'] })
		).toThrow(ServiceError);
		expect(() =>
			checkServiceCall({ domain: 'light', service: 'turn_on', entity_id: 'light' })
		).toThrow(ServiceError);
		expect(() => checkServiceCall({ domain: 'light', service: 'turn_on', entity_id: [] })).toThrow(
			ServiceError
		);
	});

	it('drops data that would target other entities', () => {
		const call = checkServiceCall({
			domain: 'light',
			service: 'turn_on',
			entity_id: 'light.a',
			data: {
				brightness: 100,
				entity_id: 'lock.b',
				area_id: 'all',
				target: { entity_id: 'lock.b' }
			}
		});
		expect(call.data).toEqual({ brightness: 100 });
	});

	it('refuses a strange service name', () => {
		expect(() =>
			checkServiceCall({ domain: 'light', service: '../turn_on', entity_id: 'light.a' })
		).toThrow(ServiceError);
	});

	it('keeps only the scene domains from the entity stream', () => {
		expect(keepEntity('climate.house')).toBe(true);
		expect(keepEntity('binary_sensor.door')).toBe(true);
		expect(keepEntity('lock.door')).toBe(false);
		expect(keepEntity('person.ana')).toBe(false);
	});
});
