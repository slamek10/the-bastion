/**
 * The server bunker (ground-floor annex, Bastion Watch): two 42U glass-front
 * racks whose blade LEDs blink by container state, a cold-aisle floor strip,
 * a UPS, a cable tray, a network health screen, and a red strobe while Watch
 * has a problem.
 */
import { Color, InstancedMesh, Matrix4, PointLight } from 'three';
import { Kit, ROOMS, drawLines, setPick, type SceneModule } from './common';
import {
	containerDown,
	freshAlarm,
	noContainersReason,
	problemFresh,
	problemText
} from '$lib/telemetry';
import type { ContainerState } from '$lib/types';

const BLADES_PER_RACK = 14;

/** where the Watchdog runs on an alert: in front of the racks */
export const RACK_FRONT = { x: 9, z: -2.2 };

function ledColor(container: ContainerState | undefined, time: number, index: number, out: Color) {
	if (!container) return out.setRGB(0.08, 0.1, 0.14);
	const blink = Math.sin(time * 6 + index * 1.7) > 0;
	if (containerDown(container))
		return blink ? out.setRGB(1, 0.1, 0.08) : out.setRGB(0.25, 0.02, 0.02);
	if (container.health === 'starting' || container.state === 'restarting')
		return blink ? out.setRGB(1, 0.7, 0.1) : out.setRGB(0.3, 0.2, 0.02);
	// running: a calm green with a flicker of activity
	const activity = Math.sin(time * (3 + (index % 5)) + index) > 0.6 ? 1 : 0.55;
	return out.setRGB(0.1 * activity, 0.95 * activity, 0.45 * activity);
}

export function buildServerBunker(): SceneModule {
	const kit = new Kit();
	const group = kit.group('serverBunker');
	const room = ROOMS.bunker;

	const frameMat = kit.mat(0x111827, { metalness: 0.7, roughness: 0.35 });
	const bladeMat = kit.mat(0x1f2937, { metalness: 0.5, roughness: 0.5 });
	const glassMat = kit.mat(0x88ccff, {
		transparent: true,
		opacity: 0.12,
		roughness: 0.05,
		metalness: 0.2
	});

	// two racks, facing +z
	const rackXs = [8.2, 10];
	const ledGeo = kit.boxGeo(0.05, 0.03, 0.02);
	const ledMat = kit.basic(0xffffff, { toneMapped: false });
	const leds = new InstancedMesh(ledGeo, ledMat, rackXs.length * BLADES_PER_RACK * 2);
	const matrix = new Matrix4();
	let n = 0;
	for (const x of rackXs) {
		const rack = kit.group('rack');
		rack.add(kit.box(0.7, 2.1, 1.1, frameMat, 0, 0, 0));
		const glass = kit.box(0.66, 2.0, 0.02, glassMat, 0, 0.05, 0.56);
		rack.add(glass);
		for (let i = 0; i < BLADES_PER_RACK; i++) {
			const y = 0.2 + i * 0.13;
			rack.add(kit.box(0.6, 0.09, 0.02, bladeMat, 0, y, 0.54));
			for (let k = 0; k < 2; k++) {
				matrix.makeTranslation(x - 0.2 + k * 0.08, y + 0.045, -3.5 + 0.56);
				leds.setMatrixAt(n++, matrix);
			}
		}
		rack.position.set(x, 0, -3.5);
		setPick(rack, { kind: 'room', id: 'bunker' });
		group.add(rack);
	}
	leds.instanceMatrix.needsUpdate = true;
	group.add(leds);

	// cold aisle strip on the floor
	const aisleMat = kit.glow(0x38bdf8, 0.8);
	const aisle = kit.plane(3, 0.5, aisleMat);
	aisle.rotation.x = -Math.PI / 2;
	aisle.position.set(9.1, 0.01, -2.4);
	group.add(aisle);

	// UPS and the cable tray
	group.add(kit.box(0.6, 1, 0.8, kit.mat(0x0f172a, { metalness: 0.6 }), 11.8, 0, -4.2));
	const upsLed = kit.box(0.3, 0.05, 0.02, kit.glow(0x22c55e, 2), 11.8, 0.8, -3.79);
	group.add(upsLed);
	const tray = kit.box(
		3.2,
		0.06,
		0.4,
		kit.mat(0x64748b, { metalness: 0.8, roughness: 0.3 }),
		9.1,
		2.5,
		-3.6
	);
	group.add(tray);
	for (const x of [7.8, 9.1, 10.4]) group.add(kit.box(0.03, 0.4, 0.03, frameMat, x, 2.56, -3.6));

	// the network health screen on the right wall, facing the room
	const screen = kit.canvas(512, 320);
	const screenMesh = kit.screen(screen, 2.2, 1.375);
	screenMesh.position.set(room.maxX - 0.12, 1.7, -1.2);
	screenMesh.rotation.y = -Math.PI / 2;
	setPick(screenMesh, { kind: 'room', id: 'bunker' });
	group.add(screenMesh);

	// the red strobe: a beacon and its light
	const beaconMat = kit.glow(0xff2020, 0);
	const beacon = kit.cylinder(0.12, 0.12, 0.2, beaconMat);
	beacon.position.set(9.1, 2.85, -1);
	group.add(beacon);
	const strobe = new PointLight(0xff2020, 0, 12, 1.5);
	strobe.position.set(9.1, 2.6, -1);
	group.add(strobe);

	const color = new Color();
	let redraw = 0;
	return {
		group,
		update(dt, ctx) {
			const { t, time } = ctx;
			const containers = t.containers;
			for (let i = 0; i < leds.count; i++) {
				const container = containers.length ? containers[i % containers.length] : undefined;
				// past the list, a blade sits dark
				ledColor(i < Math.max(containers.length, 1) * 2 ? container : undefined, time, i, color);
				leds.setColorAt(i, color);
			}
			if (leds.instanceColor) leds.instanceColor.needsUpdate = true;

			// fresh: the red strobe; standing (older than half an hour): a slow amber beacon only
			const alarm = freshAlarm(t);
			const standing = !alarm && (t.problems.length > 0 || containers.some(containerDown));
			const flash = alarm && Math.sin(time * 14) > 0.2 ? 1 : 0;
			strobe.intensity = flash * 25;
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
					: 0.15;

			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1;
				const down = containers.filter(containerDown);
				const peers = Object.entries(t.peers).map(([peer, state]) => ({
					text: `${peer.padEnd(6)} ${state}`,
					color: state === 'ok' ? '#4ade80' : state === 'not configured' ? '#64748b' : '#f87171'
				}));
				drawLines(
					screen,
					[
						noContainersReason(t)
							? { text: noContainersReason(t)!, color: '#fbbf24' }
							: {
									text: `${containers.length - down.length}/${containers.length} containers up`,
									color: down.length ? '#f87171' : '#4ade80'
								},
						// fresh problems first; standing ones dimmer, marked with their age
						...[...t.problems]
							.sort((a, b) => b.since - a.since)
							.slice(0, 3)
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
						...peers
					],
					{ title: 'NETWORK HEALTH', size: 20 }
				);
			}
		},
		dispose() {
			leds.dispose();
			kit.dispose();
		}
	};
}
