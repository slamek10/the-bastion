/**
 * The Watch forge (bastion-watch): a stone workshop whose big front windows
 * show two server racks with LEDs blinking by container state, a beacon on
 * the roof (red strobe for a fresh problem, slow amber for standing ones,
 * dark otherwise) and a network board by the door, which says "no Docker
 * device in Watch" when there are no containers.
 */
import { Color, InstancedMesh, Matrix4, PointLight } from 'three';
import { Kit, drawLines, hipRoof, placeBuilding, setPick, type SceneModule } from './common';
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
const H = 3.4;

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

export function buildWatchForge(): SceneModule {
	const kit = new Kit();
	const b = BUILDINGS.forge;
	const { group, w, d } = placeBuilding(kit, b);

	const stone = kit.mat(0x8f8a82, { roughness: 1, flatShading: true });
	const dark = kit.mat(0x2b2f36, { metalness: 0.4, roughness: 0.6 });
	const glass = kit.mat(0xbfe3ff, { transparent: true, opacity: 0.18, roughness: 0.05 });
	const t = 0.35;

	const floor = kit.box(w, 0.1, d, kit.mat(0x4b4f57), 0, -0.06, 0);
	floor.receiveShadow = true;
	group.add(floor);
	// back and sides solid, the front open with big windows either side of the door
	group.add(kit.box(w, H, t, stone, 0, 0, -d / 2 + t / 2));
	group.add(kit.box(t, H, d, stone, -w / 2 + t / 2, 0, 0));
	group.add(kit.box(t, H, d, stone, w / 2 - t / 2, 0, 0));
	group.add(kit.box(w, 0.8, t, stone, 0, 0, d / 2 - t / 2));
	group.add(kit.box(w, 0.6, t, stone, 0, H - 0.6, d / 2 - t / 2));
	for (const x of [-w / 2 + 0.3, -0.9, 0.9, w / 2 - 0.3])
		group.add(kit.box(0.5, H, t, stone, x, 0, d / 2 - t / 2));
	for (const x of [-(w / 4 + 0.15), w / 4 + 0.15]) {
		const pane = kit.box(w / 2 - 1.4, H - 1.4, 0.05, glass, x, 0.8, d / 2 - t / 2);
		group.add(pane);
	}
	group.traverse((child) => {
		child.castShadow = true;
		child.receiveShadow = true;
	});
	const roof = hipRoof(kit, w, d, 2.2, kit.mat(0x4a5260, { flatShading: true }), H);
	group.add(roof);

	// racks inside, glass fronts toward the windows
	const rackXs = [-2.1, 2.1];
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
			rack.add(kit.box(0.7, 0.1, 0.02, kit.mat(0x1f2937), 0, y, 0.5));
			for (let k = 0; k < 2; k++) {
				m.makeTranslation(x - 0.22 + k * 0.1, y + 0.05, -0.6 + 0.52);
				leds.setMatrixAt(n++, m);
			}
		}
		rack.position.set(x, 0, -0.6);
		group.add(rack);
	}
	leds.instanceMatrix.needsUpdate = true;
	group.add(leds);
	const aisleMat = kit.glow(0x38bdf8, 0.8);
	const aisle = kit.plane(5, 0.5, aisleMat);
	aisle.rotation.x = -Math.PI / 2;
	aisle.position.set(0, 0.01, 0.3);
	group.add(aisle);
	const glow = new PointLight(0x38bdf8, 4, 8, 1.6);
	glow.position.set(0, 2.4, 0.5);
	group.add(glow);

	// the beacon on the roof
	const beaconMat = kit.glow(0xff2020, 0);
	const beacon = kit.cylinder(0.25, 0.25, 0.4, beaconMat, 16);
	beacon.position.set(0, H + 2.3, 0);
	group.add(beacon);
	const strobe = new PointLight(0xff2020, 0, 20, 1.5);
	strobe.position.set(0, H + 2.6, 0);
	group.add(strobe);

	// the network board by the door
	const board = kit.canvas(512, 320);
	const boardMesh = kit.screen(board, 1.9, 1.19);
	boardMesh.position.set(w / 2 - 0.9, 1.7, d / 2 + 0.6);
	group.add(boardMesh);
	group.add(kit.box(0.1, 1.2, 0.1, kit.mat(0x6b4426), w / 2 - 0.9, 0, d / 2 + 0.55));
	setPick(group, { kind: 'room', id: 'forge' });

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
			strobe.intensity = flash * 40;
			beaconMat.color.setHex(alarm ? 0xff2020 : 0xf59e0b);
			beaconMat.emissive.setHex(alarm ? 0xff2020 : 0xf59e0b);
			beaconMat.emissiveIntensity = alarm
				? 0.5 + flash * 3
				: standing
					? 0.6 + Math.sin(time * 1.2) * 0.4
					: 0;
			aisleMat.emissiveIntensity = alarm
				? 0.4
				: containers.length
					? 0.8 + Math.sin(time * 1.5) * 0.15
					: 0.1;
			glow.intensity = containers.length ? 4 : 0.5;

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
							.sort((a, b2) => b2.since - a.since)
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
