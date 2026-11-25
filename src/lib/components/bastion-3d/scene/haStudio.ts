/**
 * The HA studio (upper floor, bastion-ha): a wall dashboard screen, a
 * pulsing Zigbee/Thread antenna, roller shutters on the back windows whose
 * height follows the room's cover.* current_position, and ceiling lamps
 * that show the room's light.* entities (on, brightness, colour).
 */
import { Color, Mesh, PointLight, SphereGeometry, TorusGeometry } from 'three';
import { FLOOR2, Kit, ROOMS, damp, lightOf, setPick, type SceneModule } from './common';
import { allOf } from '$lib/bindings';

const WINDOWS = [-8, -4.5, -1.8];
const WIN_W = 1.8;
const WIN_H = 1.6;
const WIN_Y = FLOOR2 + 0.9;
const OFF = new Color(0x1e293b);

export function buildHaStudio(): SceneModule {
	const kit = new Kit();
	const group = kit.group('haStudio');
	const room = ROOMS.studio;

	// windows: a glowing pane (the sky outside) and a shutter that rolls down over it
	const paneMat = kit.mat(0x93c5fd, { emissive: 0x1d4ed8, emissiveIntensity: 0.6, roughness: 0.1 });
	const shutterMat = kit.mat(0x9ca3af, { metalness: 0.5, roughness: 0.6 });
	const boxMat = kit.mat(0x475569, { metalness: 0.5 });
	const shutters = WINDOWS.map((x) => {
		const pane = kit.plane(WIN_W, WIN_H, paneMat);
		pane.position.set(x, WIN_Y + WIN_H / 2, -4.88);
		group.add(pane);
		group.add(kit.box(WIN_W + 0.1, 0.18, 0.2, boxMat, x, WIN_Y + WIN_H, -4.8));
		// a unit-height box scaled in y, hanging from the top
		const shutter = kit.box(WIN_W, 1, 0.04, shutterMat, 0, 0, 0);
		shutter.geometry = kit.boxGeo(WIN_W, 1, 0.04);
		shutter.position.set(x, WIN_Y + WIN_H, -4.84);
		group.add(shutter);
		setPick(shutter, { kind: 'room', id: 'studio' });
		return { mesh: shutter, open: 1 };
	});

	// the wall dashboard on the left wall
	const screen = kit.canvas(640, 400);
	const dash = kit.screen(screen, 2.4, 1.5);
	dash.position.set(room.minX + 0.12, FLOOR2 + 1.7, 0);
	dash.rotation.y = Math.PI / 2;
	setPick(dash, { kind: 'room', id: 'studio' });
	group.add(dash);

	// antenna: a mast, a pulsing tip and expanding rings
	const mastMat = kit.mat(0x334155, { metalness: 0.8 });
	const mast = kit.cylinder(0.03, 0.05, 1.4, mastMat, 8);
	mast.position.set(-1, FLOOR2 + 0.7, -4.2);
	group.add(mast);
	const tipMat = kit.glow(0x22d3ee, 2);
	const tip = new Mesh(kit.geo(new SphereGeometry(0.08, 12, 12)), tipMat);
	tip.position.set(-1, FLOOR2 + 1.45, -4.2);
	group.add(tip);
	const ringGeo = kit.geo(new TorusGeometry(0.2, 0.012, 6, 32));
	const pulses = [0, 1, 2].map(() => {
		const material = kit.basic(0x22d3ee, { transparent: true, opacity: 0, toneMapped: false });
		const ring = new Mesh(ringGeo, material);
		ring.rotation.x = Math.PI / 2;
		ring.position.copy(tip.position);
		group.add(ring);
		return { ring, material };
	});

	// desk and chair
	const desk = kit.box(1.8, 0.06, 0.7, kit.mat(0x1f2937), -6, FLOOR2 + 0.72, -3.8);
	group.add(desk);
	group.add(kit.box(0.5, 0.5, 0.5, kit.mat(0x334155), -6, FLOOR2, -2.9));

	// ceiling lamps: one per bound light (up to 4), else one that's dark
	const lampGeo = kit.geo(new SphereGeometry(0.16, 16, 12));
	const lamps = [-7.5, -5, -2.5, -0.8].map((x) => {
		const material = kit.mat(0x1e293b, { emissive: 0x000000, emissiveIntensity: 1 });
		const lamp = new Mesh(lampGeo, material);
		lamp.position.set(x, FLOOR2 + 2.75, 0);
		group.add(lamp);
		const light = new PointLight(0xffffff, 0, 6, 1.8);
		light.position.set(x, FLOOR2 + 2.5, 0);
		group.add(light);
		return { lamp, material, light };
	});

	let redraw = 0;
	return {
		group,
		update(dt, ctx) {
			const covers = allOf(ctx.bindings, 'studio', 'cover');
			shutters.forEach((shutter, i) => {
				const id = covers[i % Math.max(covers.length, 1)];
				const entity = id ? ctx.t.ha[id] : undefined;
				const position = entity?.attributes.current_position;
				const open =
					typeof position === 'number'
						? position / 100
						: entity
							? entity.state === 'closed'
								? 0
								: 1
							: 1;
				shutter.open = damp(shutter.open, open, 3, dt);
				const height = Math.max(0.04, (1 - shutter.open) * WIN_H);
				shutter.mesh.scale.y = height;
				shutter.mesh.position.y = WIN_Y + WIN_H - height / 2;
			});

			const lights = allOf(ctx.bindings, 'studio', 'light');
			lamps.forEach(({ material, light, lamp }, i) => {
				const id = lights[i];
				lamp.visible = !!id || i === 0;
				const state = lightOf(id ? ctx.t.ha[id] : undefined);
				const level = state?.level ?? 0;
				material.emissive.copy(state?.color ?? OFF);
				material.emissiveIntensity = damp(
					material.emissiveIntensity,
					state ? 0.5 + level * 2 : 0,
					6,
					dt
				);
				if (state) light.color.copy(state.color);
				light.intensity = damp(light.intensity, level * 6, 6, dt);
			});

			// the antenna pulses faster while Home Assistant answers
			const rate = ctx.t.peers.hass === 'ok' ? 1.2 : 0.3;
			tipMat.emissiveIntensity = 1.2 + Math.sin(ctx.time * 5 * rate) * 0.8;
			pulses.forEach(({ ring, material }, i) => {
				const phase = (ctx.time * rate + i / 3) % 1;
				ring.scale.setScalar(1 + phase * 4);
				material.opacity = (1 - phase) * 0.7;
			});

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 0.5;
				const { ctx: c, width, height } = screen;
				c.fillStyle = '#0b1222';
				c.fillRect(0, 0, width, height);
				c.fillStyle = '#7dd3fc';
				c.font = '600 30px ui-sans-serif, system-ui';
				c.fillText('HOME ASSISTANT', 24, 46);
				const entities = Object.values(ctx.t.ha);
				const on = entities.filter(
					(e) => e.entity_id.startsWith('light.') && e.state === 'on'
				).length;
				const open = entities.filter(
					(e) => e.entity_id.startsWith('cover.') && e.state === 'open'
				).length;
				const tiles: [string, string, string][] = [
					['Lights on', String(on), '#fde68a'],
					['Covers open', String(open), '#a5f3fc'],
					['Entities', String(entities.length), '#c4b5fd'],
					['HA', ctx.t.peers.hass, ctx.t.peers.hass === 'ok' ? '#86efac' : '#fca5a5']
				];
				tiles.forEach(([label, value, color], i) => {
					const x = 24 + (i % 2) * 300;
					const y = 80 + Math.floor(i / 2) * 150;
					c.fillStyle = 'rgba(255,255,255,0.06)';
					c.fillRect(x, y, 280, 130);
					c.fillStyle = '#94a3b8';
					c.font = '22px ui-sans-serif, system-ui';
					c.fillText(label, x + 16, y + 34);
					c.fillStyle = color;
					c.font = '600 48px ui-sans-serif, system-ui';
					c.fillText(value.slice(0, 12), x + 16, y + 100);
				});
				screen.refresh();
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
