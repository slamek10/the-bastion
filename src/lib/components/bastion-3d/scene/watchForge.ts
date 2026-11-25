/**
 * The Watch forge (bastion-watch): a brick-and-stone workshop whose round
 * windows glow with the server racks' LEDs inside (blinking by container
 * state), a cable bundle running to a small antenna mast, the alert beacon
 * in a lantern on the roof (red strobe for a fresh problem, slow amber for
 * standing ones, dark otherwise) and a network board by the door, which says
 * "no Docker device in Watch" when there are no containers.
 */
import {
	CatmullRomCurve3,
	Color,
	InstancedMesh,
	Matrix4,
	Mesh,
	PointLight,
	TubeGeometry,
	Vector3
} from 'three';
import {
	glowOnly,
	Kit,
	drawLines,
	placeBuilding,
	setPick,
	type BuildAssets,
	type SceneModule
} from './common';
import { buildHouse, finishHouse, mergeStatic } from './buildingKit';
import { BUILDINGS } from '$lib/village/layout';
import {
	containerDown,
	freshAlarm,
	noContainersReason,
	problemFresh,
	problemText
} from '$lib/telemetry';
import type { ContainerState } from '$lib/types';

const BLADES = 12;

function ledColor(container: ContainerState | undefined, time: number, index: number, out: Color) {
	if (!container) return out.setRGB(0.08, 0.1, 0.14);
	const blink = Math.sin(time * 6 + index * 1.7) > 0;
	if (containerDown(container))
		return blink ? out.setRGB(1, 0.1, 0.08) : out.setRGB(0.25, 0.02, 0.02);
	if (container.health === 'starting' || container.state === 'restarting')
		return blink ? out.setRGB(1, 0.7, 0.1) : out.setRGB(0.3, 0.2, 0.02);
	const activity = Math.sin(time * (3 + (index % 5)) + index) > 0.6 ? 1 : 0.55;
	return out.setRGB(0.1 * activity, 0.95 * activity, 0.45 * activity);
}

export function buildWatchForge({ kits }: BuildAssets): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.forge;
	const { group, w, d } = placeBuilding(kit, b);

	const house = buildHouse(kits.village, kits.nature, kit, {
		w,
		d,
		style: 'brick',
		roof: 'Roof_RoundTiles_8x8',
		gable: 'Roof_Front_Brick8',
		chimney: [2.2, -1.5],
		windows: { front: true, back: false, sides: true }
	});
	finishHouse(house, kit);
	group.add(house.group);
	for (let x = -w / 2 + 1; x < w / 2; x += 2)
		for (let z = -d / 2 + 1; z < d / 2; z += 2)
			group.add(kits.village.clone('Floor_WoodDark', x, 0.02, z));

	// racks inside, their fronts toward the door
	const dark = kit.mat(0x1f2530, { metalness: 0.5, roughness: 0.5 });
	const rackXs = [-1.8, 1.8];
	const leds = new InstancedMesh(
		kit.boxGeo(0.06, 0.035, 0.02),
		kit.basic(0xffffff, { toneMapped: false }),
		rackXs.length * BLADES * 2
	);
	const m = new Matrix4();
	let n = 0;
	for (const x of rackXs) {
		const rack = kit.group('rack');
		rack.add(kit.box(0.8, 2.2, 1, dark, 0, 0, 0));
		for (let i = 0; i < BLADES; i++) {
			const y = 0.25 + i * 0.15;
			rack.add(kit.box(0.7, 0.1, 0.02, kit.mat(0x2a3140), 0, y, 0.5));
			for (let k = 0; k < 2; k++) {
				m.makeTranslation(x - 0.22 + k * 0.1, y + 0.05, -1.2 + 0.52);
				leds.setMatrixAt(n++, m);
			}
		}
		rack.position.set(x, 0, -1.2);
		group.add(rack);
	}
	leds.instanceMatrix.needsUpdate = true;
	group.add(leds);
	const glow = glowOnly(0x38bdf8);

	// the beacon in a little lantern on the roof ridge
	const top = house.height + 4.4;
	group.add(kit.box(0.7, 0.12, 0.7, kit.mat(0x2f3338, { metalness: 0.6 }), 0, top - 0.1, 0));
	const beaconMat = kit.glow(0xff2020, 0);
	const beacon = kit.cylinder(0.26, 0.26, 0.45, beaconMat, 16);
	beacon.position.set(0, top + 0.25, 0);
	group.add(beacon);
	group.add(
		kit.cylinder(0.05, 0.35, 0.3, kit.mat(0x2f3338, { metalness: 0.6 }), 4).translateY(top + 0.62)
	);
	const strobe = new PointLight(0xff2020, 0, 26, 1.5);
	strobe.position.set(0, top + 0.6, 0);
	group.add(strobe);

	// a cable bundle from the wall to an antenna mast
	const mastX = w / 2 + 2.2;
	const curve = new CatmullRomCurve3([
		new Vector3(w / 2 - 0.1, 2.6, -1),
		new Vector3(w / 2 + 0.8, 2.2, -1.2),
		new Vector3(mastX - 0.5, 2.5, -1.6),
		new Vector3(mastX, 3.4, -1.8)
	]);
	const cableMat = kit.mat(0x22262b, { roughness: 0.7 });
	for (const offset of [0, 0.07, -0.07]) {
		const cable = new Mesh(kit.geo(new TubeGeometry(curve, 24, 0.035, 6)), cableMat);
		cable.position.set(0, offset, offset);
		cable.castShadow = true;
		group.add(cable);
	}
	const mast = kit.cylinder(0.06, 0.1, 6, kit.mat(0x8d949c, { metalness: 0.7, roughness: 0.4 }), 8);
	mast.position.set(mastX, 3, -1.8);
	mast.castShadow = true;
	group.add(mast);
	for (const y of [4.6, 5.4]) {
		const arm = kit.box(1.2, 0.05, 0.05, kit.mat(0x8d949c, { metalness: 0.7 }), mastX, y, -1.8);
		group.add(arm);
	}
	const tipMat = kit.glow(0xef4444, 1.5);
	const tip = kit.cylinder(0.08, 0.08, 0.12, tipMat, 8);
	tip.position.set(mastX, 6.05, -1.8);
	group.add(tip);

	// crates and a wagon by the workshop
	group.add(kits.village.clone('Prop_Crate', -w / 2 - 0.9, 0, 1.2, 0.3, 0.8));
	group.add(kits.village.clone('Prop_Crate', -w / 2 - 0.8, 0, 2.3, -0.2, 0.7));
	group.add(kits.village.clone('Prop_Wagon', -w / 2 - 2.6, 0, -0.5, 0.15, 0.9));

	// the network board by the door
	const board = kit.canvas(512, 320);
	const boardMesh = kit.screen(board, 1.9, 1.19);
	boardMesh.position.set(w / 2 - 0.4, 1.8, d / 2 + 0.9);
	group.add(boardMesh);
	group.add(kit.box(0.1, 1.25, 0.1, kit.mat(0x6b4426), w / 2 - 0.4, 0, d / 2 + 0.85));
	setPick(group, { kind: 'room', id: 'forge' });

	mergeStatic(group, kit, new Set([leds]));

	const color = new Color();
	let redraw = 0;
	return {
		group,
		update(dt, ctx) {
			const { t, time } = ctx;
			const containers = t.containers;
			for (let i = 0; i < leds.count; i++) {
				const container = containers.length ? containers[i % containers.length] : undefined;
				ledColor(i < Math.max(containers.length, 1) * 2 ? container : undefined, time, i, color);
				leds.setColorAt(i, color);
			}
			if (leds.instanceColor) leds.instanceColor.needsUpdate = true;

			const alarm = freshAlarm(t);
			const standing = !alarm && (t.problems.length > 0 || containers.some(containerDown));
			const flash = alarm && Math.sin(time * 14) > 0.2 ? 1 : 0;
			strobe.intensity = flash * 60;
			beaconMat.color.setHex(alarm ? 0xff2020 : 0xf59e0b);
			beaconMat.emissive.setHex(alarm ? 0xff2020 : 0xf59e0b);
			beaconMat.emissiveIntensity = alarm
				? 0.5 + flash * 4
				: standing
					? 0.8 + Math.sin(time * 1.2) * 0.6
					: 0;
			glow.intensity = containers.length ? 3 + ctx.glow * 3 : 0.5;
			// the windows take the racks' blue
			for (const glass of house.glass) {
				glass.emissive.setHex(alarm ? 0xff5a4a : containers.length ? 0x5fc8ff : 0xffb45c);
				glass.emissiveIntensity = (containers.length ? 0.5 : 0.1) + ctx.glow * 1.2;
			}
			tipMat.emissiveIntensity = Math.sin(time * 3) > 0 ? 2 : 0.3;
			house.doorLamp.intensity = ctx.glow * 6;
			house.doorLampGlow.emissiveIntensity = ctx.glow * 3;

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1;
				const down = containers.filter(containerDown);
				const reason = noContainersReason(t);
				drawLines(
					board,
					[
						reason
							? { text: reason, color: '#fbbf24' }
							: {
									text: `${containers.length - down.length}/${containers.length} containers up`,
									color: down.length ? '#f87171' : '#4ade80'
								},
						...[...t.problems]
							.sort((a, z) => z.since - a.since)
							.slice(0, 4)
							.map((problem) => {
								const fresh = problemFresh(problem);
								const hours = Math.round((Date.now() - problem.since) / 3_600_000);
								return {
									text: `${fresh ? '!' : '·'} ${problemText(problem)}${fresh ? '' : ` ${hours}h`}`.slice(
										0,
										34
									),
									color: !fresh
										? '#94a3b8'
										: problem.severity === 'critical'
											? '#f87171'
											: '#fbbf24'
								};
							}),
						...Object.entries(t.peers).map(([peer, state]) => ({
							text: `${peer.padEnd(6)} ${state}`,
							color: state === 'ok' ? '#4ade80' : state === 'not configured' ? '#64748b' : '#f87171'
						}))
					],
					{ title: 'WATCH', size: 20 }
				);
			}
		},
		dispose() {
			leds.dispose();
			kit.dispose();
		}
	};
}
