/**
 * The boiler house (bastion-heat): a brick bathhouse with a chimney that
 * smokes while the heating runs, copper pipes on its front going from blue
 * to glowing orange, and a thermostat sign from the first climate.* bound
 * to it.
 */
import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	NormalBlending,
	PointLight,
	Points,
	PointsMaterial
} from 'three';
import { Kit, damp, hipRoof, placeBuilding, setPick, walls, type SceneModule } from './common';
import { BUILDINGS } from '$lib/village/layout';
import { firstOf } from '$lib/bindings';

const COLD = new Color(0x4f86c6);
const HOT = new Color(0xf97316);
const SMOKE = 70;
const H = 3.2;

export function buildBoilerHouse(): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.boiler;
	const { group, w, d } = placeBuilding(kit, b);

	const brick = kit.mat(0xb5654a, { roughness: 1 });
	const floor = kit.box(w, 0.1, d, kit.mat(0x6b5b4b), 0, -0.06, 0);
	floor.receiveShadow = true;
	group.add(floor);
	group.add(walls(kit, w, d, H, brick, 1.5).group);
	group.add(hipRoof(kit, w, d, 2.2, kit.mat(0x5b3a2a, { flatShading: true }), H));
	// a warm window either side of the door
	const windowMat = kit.mat(0xffc98a, { emissive: 0xff8a2a, emissiveIntensity: 0.2 });
	for (const x of [-2, 2]) {
		const pane = kit.plane(1, 1, windowMat);
		pane.position.set(x, 1.8, d / 2 + 0.01);
		group.add(pane);
	}

	// the chimney and its smoke
	const chimney = kit.box(0.9, 3, 0.9, brick, w / 2 - 1.3, H, -d / 2 + 1.3);
	chimney.castShadow = true;
	group.add(chimney);
	const top = { x: w / 2 - 1.3, y: H + 3.1, z: -d / 2 + 1.3 };
	const positions = new Float32Array(SMOKE * 3);
	const ages = new Float32Array(SMOKE);
	for (let i = 0; i < SMOKE; i++) {
		ages[i] = i / SMOKE;
		positions[i * 3] = top.x;
		positions[i * 3 + 1] = top.y + ages[i] * 4;
		positions[i * 3 + 2] = top.z;
	}
	const smokeGeo = kit.geo(new BufferGeometry());
	smokeGeo.setAttribute('position', new BufferAttribute(positions, 3));
	const smokeMat = kit.d.track(
		new PointsMaterial({
			color: 0xdedede,
			size: 0.7,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: NormalBlending
		})
	);
	group.add(new Points(smokeGeo, smokeMat));

	// copper pipes on the front, either side of the door
	const pipeMat = kit.mat(0x4f86c6, { metalness: 0.8, roughness: 0.3, emissive: 0x000000 });
	for (const x of [-1.2, -3, 1.2, 3]) {
		const riser = kit.cylinder(0.07, 0.07, 2.6, pipeMat, 8);
		riser.position.set(x * 0.9, 1.3, d / 2 + 0.12);
		group.add(riser);
	}
	for (const side of [-1, 1]) {
		const header = kit.cylinder(0.07, 0.07, 2.4, pipeMat, 8);
		header.rotation.z = Math.PI / 2;
		header.position.set(side * 1.9, 2.6, d / 2 + 0.12);
		group.add(header);
	}
	const sparks = new Float32Array(40 * 3);
	for (let i = 0; i < 40; i++) {
		sparks[i * 3] = (Math.random() - 0.5) * 5;
		sparks[i * 3 + 1] = Math.random() * 2.6;
		sparks[i * 3 + 2] = d / 2 + 0.2;
	}
	const sparkGeo = kit.geo(new BufferGeometry());
	sparkGeo.setAttribute('position', new BufferAttribute(sparks, 3));
	const sparkMat = kit.d.track(
		new PointsMaterial({
			color: 0xffa14a,
			size: 0.12,
			transparent: true,
			opacity: 0,
			blending: AdditiveBlending,
			depthWrite: false
		})
	);
	group.add(new Points(sparkGeo, sparkMat));
	const glow = new PointLight(0xf97316, 0, 7, 1.5);
	glow.position.set(0, 1.6, d / 2 + 1);
	group.add(glow);

	// the thermostat sign by the door
	const sign = kit.canvas(320, 320);
	const signMesh = kit.screen(sign, 1, 1);
	signMesh.position.set(w / 2 - 0.6, 1.6, d / 2 + 0.8);
	group.add(signMesh);
	group.add(kit.box(0.1, 1.1, 0.1, kit.mat(0x6b4426), w / 2 - 0.6, 0, d / 2 + 0.75));
	setPick(group, { kind: 'room', id: 'boiler' });

	let heat = 0;
	let redraw = 0;
	const color = new Color();
	return {
		group,
		update(dt, ctx) {
			const climateId = firstOf(ctx.bindings, 'boiler', 'climate');
			const climate = climateId ? ctx.t.ha[climateId] : undefined;
			const heating = ctx.t.heat.active || climate?.attributes.hvac_action === 'heating';
			heat = damp(heat, heating ? 1 : 0, 1.2, dt);
			color.copy(COLD).lerp(HOT, heat);
			pipeMat.color.copy(color);
			pipeMat.emissive.copy(color).multiplyScalar(heat * 0.7);
			windowMat.emissiveIntensity = 0.2 + heat * 1.4 + (1 - ctx.day) * 0.4;
			glow.intensity = heat * 6;
			sparkMat.opacity = heat * 0.9;
			smokeMat.opacity = heat * 0.55;
			if (heat > 0.02) {
				for (let i = 0; i < SMOKE; i++) {
					ages[i] = (ages[i] + dt * 0.18) % 1;
					const age = ages[i];
					positions[i * 3] = top.x + Math.sin(age * 6 + i) * age * 0.6 + age * 1.2;
					positions[i * 3 + 1] = top.y + age * 4.5;
					positions[i * 3 + 2] = top.z + Math.cos(age * 5 + i) * age * 0.6;
				}
				smokeGeo.attributes.position.needsUpdate = true;
				for (let i = 0; i < 40; i++) {
					let y = sparks[i * 3 + 1] + dt * (0.6 + heat);
					if (y > 2.7) y = 0.1;
					sparks[i * 3 + 1] = y;
				}
				sparkGeo.attributes.position.needsUpdate = true;
			}

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1;
				const { ctx: c, width } = sign;
				c.fillStyle = '#2b1d14';
				c.fillRect(0, 0, width, width);
				c.strokeStyle = heating ? '#f97316' : '#4f86c6';
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
				c.fillStyle = '#fef3c7';
				const current = climate?.attributes.current_temperature;
				const target = climate?.attributes.temperature;
				c.font = '600 64px ui-sans-serif, system-ui';
				c.fillText(typeof current === 'number' ? `${current.toFixed(1)}°` : '--.-°', 160, 180);
				c.font = '24px ui-sans-serif, system-ui';
				c.fillStyle = '#d6c4a8';
				c.fillText(
					climate
						? `target ${typeof target === 'number' ? target : '–'}° · ${climate.state}`
						: 'no climate bound',
					160,
					225
				);
				c.fillStyle = heating ? '#fb923c' : '#93c5fd';
				c.fillText(heating ? 'HEATING' : 'IDLE', 160, 262);
				c.textAlign = 'start';
				sign.refresh();
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
