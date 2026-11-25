/**
 * The climate deck (utility room, bastion-heat): a boiler, a steel buffer
 * tank, manifold pipes with heat particles rising while the heating runs,
 * the pipes' colour going from blue to orange with it, and a thermostat
 * readout from the room's first bound climate.* entity.
 */
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	Mesh,
	Points,
	PointsMaterial,
	PointLight,
	TorusGeometry,
	AdditiveBlending
} from 'three';
import { Kit, ROOMS, damp, setPick, type SceneModule } from './common';
import { firstOf } from '$lib/bindings';

const COLD = new Color(0x3b82f6);
const HOT = new Color(0xf97316);
const PARTICLES = 160;

export function buildClimateDeck(): SceneModule {
	const kit = new Kit();
	const group = kit.group('climateDeck');
	const room = ROOMS.utility;

	// boiler
	const boiler = kit.group('boiler');
	boiler.add(kit.box(0.9, 1.6, 0.6, kit.mat(0xe2e8f0, { roughness: 0.4 }), 0, 0.4, 0));
	const flameMat = kit.glow(0xf97316, 0);
	boiler.add(kit.box(0.3, 0.12, 0.02, flameMat, 0, 1.1, 0.31));
	boiler.add(kit.box(0.9, 0.4, 0.6, kit.mat(0x94a3b8), 0, 0, 0));
	boiler.position.set(-9.2, 0, -4.4);
	setPick(boiler, { kind: 'room', id: 'utility' });
	group.add(boiler);

	// buffer tank: steel, with bands
	const steel = kit.mat(0xcbd5e1, { metalness: 0.9, roughness: 0.25 });
	const tank = kit.cylinder(0.5, 0.5, 2.1, steel, 32);
	tank.position.set(-7.6, 1.05, -4.2);
	setPick(tank, { kind: 'room', id: 'utility' });
	group.add(tank);
	const bandMat = kit.mat(0x64748b, { metalness: 0.8, roughness: 0.3 });
	for (const y of [0.4, 1.05, 1.7]) {
		const band = new Mesh(kit.geo(new TorusGeometry(0.51, 0.025, 6, 40)), bandMat);
		band.rotation.x = Math.PI / 2;
		band.position.set(-7.6, y, -4.2);
		group.add(band);
	}

	// manifold: one horizontal header and risers
	const pipeMat = kit.mat(0x3b82f6, { metalness: 0.6, roughness: 0.35, emissive: 0x000000 });
	const header = kit.cylinder(0.06, 0.06, 5, pipeMat, 10);
	header.rotation.z = Math.PI / 2;
	header.position.set(-7, 2.3, -4.75);
	group.add(header);
	const risers = [-9.2, -8.3, -7.6, -6.6, -5.6, -4.7];
	for (const x of risers) {
		const riser = kit.cylinder(0.045, 0.045, 1.6, pipeMat, 8);
		riser.position.set(x, 1.5, -4.75);
		group.add(riser);
		const valve = kit.box(0.14, 0.14, 0.14, kit.mat(0xdc2626), x, 1.9, -4.7);
		group.add(valve);
	}

	// heat particles rising along the risers
	const positions = new Float32Array(PARTICLES * 3);
	const speeds = new Float32Array(PARTICLES);
	for (let i = 0; i < PARTICLES; i++) {
		positions[i * 3] = risers[i % risers.length] + (Math.random() - 0.5) * 0.15;
		positions[i * 3 + 1] = 0.7 + Math.random() * 2.2;
		positions[i * 3 + 2] = -4.6 + Math.random() * 0.2;
		speeds[i] = 0.4 + Math.random() * 0.6;
	}
	const particleGeo = kit.geo(new BufferGeometry());
	particleGeo.setAttribute('position', new BufferAttribute(positions, 3));
	const particleMat = kit.d.track(
		new PointsMaterial({
			color: 0xffa14a,
			size: 0.08,
			transparent: true,
			opacity: 0,
			blending: AdditiveBlending,
			depthWrite: false
		})
	);
	const particles = new Points(particleGeo, particleMat);
	group.add(particles);

	const glow = new PointLight(0xf97316, 0, 6, 1.5);
	glow.position.set(-7.5, 1.5, -3.8);
	group.add(glow);

	// thermostat readout on the left wall
	const screen = kit.canvas(320, 320);
	const readout = kit.screen(screen, 0.8, 0.8);
	readout.position.set(room.minX + 0.12, 1.6, 0.5);
	readout.rotation.y = Math.PI / 2;
	setPick(readout, { kind: 'room', id: 'utility' });
	group.add(readout);

	let heat = 0;
	let redraw = 0;
	const color = new Color();
	return {
		group,
		update(dt, ctx) {
			const climateId = firstOf(ctx.bindings, 'utility', 'climate');
			const climate = climateId ? ctx.t.ha[climateId] : undefined;
			const heating = ctx.t.heat.active || climate?.attributes.hvac_action === 'heating';
			heat = damp(heat, heating ? 1 : 0, 1.2, dt);
			color.copy(COLD).lerp(HOT, heat);
			pipeMat.color.copy(color);
			pipeMat.emissive.copy(color).multiplyScalar(heat * 0.6);
			flameMat.emissiveIntensity = heat * 3 * (0.8 + Math.sin(ctx.time * 20) * 0.2);
			glow.intensity = heat * 6;
			particleMat.opacity = heat * 0.9;
			if (heat > 0.02) {
				for (let i = 0; i < PARTICLES; i++) {
					let y = positions[i * 3 + 1] + speeds[i] * dt * (0.5 + heat);
					if (y > 2.9) y = 0.7;
					positions[i * 3 + 1] = y;
				}
				particleGeo.attributes.position.needsUpdate = true;
			}

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1;
				const { ctx: c, width } = screen;
				c.fillStyle = '#07101d';
				c.fillRect(0, 0, width, width);
				c.strokeStyle = heating ? '#f97316' : '#3b82f6';
				c.lineWidth = 14;
				c.beginPath();
				c.arc(
					160,
					165,
					120,
					Math.PI * 0.75,
					Math.PI * 0.75 + Math.PI * 1.5 * (heating ? 0.8 : 0.4)
				);
				c.stroke();
				c.textAlign = 'center';
				c.fillStyle = '#e2e8f0';
				const current = climate?.attributes.current_temperature;
				const target = climate?.attributes.temperature;
				c.font = '600 64px ui-sans-serif, system-ui';
				c.fillText(typeof current === 'number' ? `${current.toFixed(1)}°` : '--.-°', 160, 180);
				c.font = '24px ui-sans-serif, system-ui';
				c.fillStyle = '#94a3b8';
				c.fillText(
					climate
						? `target ${typeof target === 'number' ? target : '–'}° · ${climate.state}`
						: 'no climate bound',
					160,
					225
				);
				c.fillStyle = heating ? '#fb923c' : '#60a5fa';
				c.fillText(heating ? 'HEATING' : 'IDLE', 160, 262);
				c.textAlign = 'start';
				screen.refresh();
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
