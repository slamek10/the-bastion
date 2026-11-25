/**
 * The neural core (living room, bastion-ai): a rotating octahedron with
 * orbiting torus rings that spin faster while an agent turn runs or the
 * voice assistant is busy, a dual-monitor desk with scrolling code, a sofa
 * and a rug.
 */
import { Mesh, OctahedronGeometry, PointLight, TorusGeometry } from 'three';
import { Kit, damp, setPick, type CanvasScreen, type SceneModule } from './common';
import { voiceActive } from '$lib/telemetry';

const CODE = [
	'const turn = await ai.turn({ mcp })',
	'for await (const e of ndjson(body))',
	"  if (e.type === 'text') emit(e)",
	'queue.run(agent, job)',
	'hub.update(s => ({ ...s, heat }))',
	"followStream('watch', '/_api/stream')",
	'subscribeEntities(conn, onChange)',
	'createShared() // bastion_session',
	'diffTelemetry(before, after)',
	'renderer.info.memory.geometries',
	'disposer.trackTree(group)',
	'agent.mode = ALERT',
	"voice.phase = 'speaking'",
	'raycaster.intersectObjects(picks)'
];

const CORE = { x: 1, y: 1.6, z: -0.5 };

function drawCode(screen: CanvasScreen, offset: number, accent: string) {
	const { ctx, width, height } = screen;
	ctx.fillStyle = '#050a14';
	ctx.fillRect(0, 0, width, height);
	ctx.font = '18px ui-monospace, monospace';
	const lineH = 24;
	const first = Math.floor(offset / lineH);
	for (let i = -1; i < height / lineH + 1; i++) {
		const index = (first + i + CODE.length * 100) % CODE.length;
		const y = i * lineH - (offset % lineH) + 30;
		ctx.fillStyle = '#334155';
		ctx.fillText(String(first + i + 1).padStart(3), 10, y);
		ctx.fillStyle = index % 3 === 0 ? accent : '#cbd5e1';
		ctx.fillText(CODE[index], 56, y);
	}
	screen.refresh();
}

export function buildNeuralCore(): SceneModule {
	const kit = new Kit();
	const group = kit.group('neuralCore');

	// the core
	const coreMat = kit.mat(0xa78bfa, {
		emissive: 0x7c3aed,
		emissiveIntensity: 1.2,
		metalness: 0.3,
		roughness: 0.2,
		flatShading: true
	});
	const core = new Mesh(kit.geo(new OctahedronGeometry(0.55, 0)), coreMat);
	core.position.set(CORE.x, CORE.y, CORE.z);
	setPick(core, { kind: 'room', id: 'living' });
	group.add(core);
	const pedestal = kit.cylinder(
		0.35,
		0.5,
		0.7,
		kit.mat(0x1e293b, { metalness: 0.7, roughness: 0.3 })
	);
	pedestal.position.set(CORE.x, 0.35, CORE.z);
	group.add(pedestal);

	const ringMats = [kit.glow(0x38bdf8, 1.6), kit.glow(0xf472b6, 1.4), kit.glow(0x34d399, 1.4)];
	const rings = ringMats.map((material, i) => {
		const ring = new Mesh(kit.geo(new TorusGeometry(0.85 + i * 0.22, 0.025, 8, 64)), material);
		ring.position.set(CORE.x, CORE.y, CORE.z);
		ring.rotation.x = Math.PI / 2 + i * 0.5;
		group.add(ring);
		return ring;
	});
	const coreLight = new PointLight(0x8b5cf6, 6, 8, 1.8);
	coreLight.position.set(CORE.x, CORE.y, CORE.z);
	group.add(coreLight);

	// the desk with two monitors, against the back wall
	const desk = kit.group('desk');
	const wood = kit.mat(0x3f2d20, { roughness: 0.8 });
	const dark = kit.mat(0x0f172a, { metalness: 0.5, roughness: 0.4 });
	desk.add(kit.box(2.2, 0.06, 0.8, wood, 0, 0.74, 0));
	for (const [x, z] of [
		[-1, -0.32],
		[1, -0.32],
		[-1, 0.32],
		[1, 0.32]
	])
		desk.add(kit.box(0.05, 0.74, 0.05, dark, x, 0, z));
	const screens = [kit.canvas(384, 256), kit.canvas(384, 256)];
	screens.forEach((screen, i) => {
		const bezel = kit.box(0.9, 0.6, 0.04, dark, -0.48 + i * 0.96, 0.95, -0.25);
		bezel.rotation.y = (i === 0 ? 1 : -1) * 0.15;
		desk.add(bezel);
		const mesh = kit.screen(screen, 0.84, 0.54);
		mesh.position.set(-0.48 + i * 0.96, 1.25, -0.225);
		mesh.rotation.y = bezel.rotation.y;
		desk.add(mesh);
		desk.add(kit.box(0.06, 0.2, 0.06, dark, -0.48 + i * 0.96, 0.77, -0.28));
	});
	desk.position.set(3.8, 0, -4.4);
	setPick(desk, { kind: 'room', id: 'living' });
	group.add(desk);

	// the sofa and the rug
	const fabric = kit.mat(0x334155, { roughness: 1 });
	const sofa = kit.group('sofa');
	sofa.add(kit.box(2.6, 0.45, 0.9, fabric, 0, 0, 0));
	sofa.add(kit.box(2.6, 0.5, 0.2, fabric, 0, 0.45, 0.35));
	sofa.add(kit.box(0.2, 0.3, 0.9, fabric, -1.3, 0.45, 0));
	sofa.add(kit.box(0.2, 0.3, 0.9, fabric, 1.3, 0.45, 0));
	sofa.position.set(1, 0, 3.4);
	group.add(sofa);
	const rug = kit.cylinder(1.9, 1.9, 0.02, kit.mat(0x4c1d95, { roughness: 1 }), 40);
	rug.position.set(CORE.x, 0.01, 1);
	group.add(rug);

	let spin = 0.4;
	let scroll = 0;
	let redraw = 0;
	return {
		group,
		update(dt, ctx) {
			const busy = ctx.agentsBusy || voiceActive(ctx.t.voice);
			spin = damp(spin, busy ? 3.2 : 0.4, 2, dt);
			core.rotation.y += spin * dt;
			core.rotation.x = Math.sin(ctx.time * 0.7) * 0.2;
			core.position.y = CORE.y + Math.sin(ctx.time * 1.3) * 0.06;
			rings.forEach((ring, i) => {
				ring.rotation.z += spin * dt * (0.6 + i * 0.35) * (i % 2 ? -1 : 1);
				ring.rotation.x += spin * dt * 0.15 * (i + 1);
			});
			coreMat.emissiveIntensity = damp(coreMat.emissiveIntensity, busy ? 2.4 : 1.1, 3, dt);
			coreLight.intensity = coreMat.emissiveIntensity * 4;

			scroll += dt * (busy ? 90 : 25);
			redraw -= dt;
			if (redraw <= 0) {
				redraw = 1 / 15;
				drawCode(screens[0], scroll, '#a78bfa');
				drawCode(screens[1], scroll * 1.4 + 200, '#38bdf8');
			}
		},
		dispose() {
			kit.dispose();
		}
	};
}
