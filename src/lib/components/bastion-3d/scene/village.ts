/**
 * The village around the buildings: grass with colour variation, soft-edged
 * dirt paths along the walking graph, a cobbled plaza with a fountain,
 * benches and flower pots, lamp posts that glow at dusk, walled garden plots
 * with vegetable rows, crates and barrels, trees, bushes, flowers, grass and
 * rocks (instanced, from the nature kit), the pond with lily pads, reeds, a
 * dock and a rowing boat, and a ring of forest fading into fog. It also owns
 * the light rigs (Golden hour, Day, Night), eased when they change, and a few
 * real lights that follow the camera at night (the other lamps only glow).
 */
import {
	AmbientLight,
	ConeGeometry,
	IcosahedronGeometry,
	MeshStandardMaterial,
	type BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	Fog,
	HemisphereLight,
	InstancedMesh,
	Matrix4,
	Mesh,
	PlaneGeometry,
	PointLight,
	Quaternion,
	SphereGeometry,
	Sprite,
	Vector3,
	type Scene
} from 'three';
import { Kit, setPick, type BuildAssets, type FrameContext, type SceneModule } from './common';
import {
	glowMaterial,
	grassMaterial,
	pathJointMaterial,
	pathMaterial,
	waterMaterial
} from './materials';
import { BUILDINGS, DOCK, EDGES, NODES, PLAZA, PLOTS, POND, type Rect } from '$lib/village/layout';
import { inPond, inRect } from '$lib/village/navigation';
import { mergeStatic } from './buildingKit';
import { rigFor, type LightMode, type Rig } from '$lib/village/lighting';

function seeded(seed: number) {
	return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const nearPath = (x: number, z: number, margin: number) => {
	for (const [a, b] of EDGES) {
		const p = NODES.get(a)!;
		const q = NODES.get(b)!;
		const dx = q.x - p.x;
		const dz = q.z - p.z;
		const k = Math.max(
			0,
			Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1))
		);
		if (Math.hypot(p.x + dx * k - x, p.z + dz * k - z) < margin) return true;
	}
	return false;
};

/** a free spot for scenery: off the paths, the plaza, the pond, the buildings and their yards */
function free(x: number, z: number, margin = 1.5) {
	if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + margin) return false;
	if (
		((x - POND.x) / (POND.rx + margin + 0.8)) ** 2 +
			((z - POND.z) / (POND.rz + margin + 0.8)) ** 2 <
		1
	)
		return false;
	for (const b of Object.values(BUILDINGS)) if (inRect(x, z, b, margin + 2.5)) return false;
	// the clock tower behind the town hall, the cottage's garden
	if (inRect(x, z, { x: 0, z: -26.2, w: 6, d: 6 }, margin)) return false;
	if (inRect(x, z, { x: -4, z: 30, w: 10, d: 8 }, margin)) return false;
	for (const plot of PLOTS) if (inRect(x, z, plot, margin)) return false;
	// the yard in front of each door stays open, so the building presets see it
	for (const b of Object.values(BUILDINGS)) {
		const door = NODES.get(b.door)!;
		if (Math.hypot(x - door.x, z - door.z) < 6 + margin) return false;
	}
	return !nearPath(x, z, margin + 0.8);
}

type Placement = { x: number; y?: number; z: number; rotation?: number; scale?: number };

export interface VillageModule extends SceneModule {
	/** the eased exposure of the current light rig, for the renderer */
	exposure: number;
	/** the sun, for the shadow map size */
	sun: DirectionalLight;
}

export function buildVillage(
	scene: Scene,
	{ kits, quality }: BuildAssets,
	initial: LightMode
): VillageModule {
	const kit = new Kit();
	const group = kit.group('village');
	const instances: InstancedMesh[] = [];
	const track = (mesh: InstancedMesh) => instances.push(mesh);
	const random = seeded(42);
	const density = quality.density;
	const m = new Matrix4();
	const q = new Quaternion();
	const up = new Vector3(0, 1, 0);

	// ground: one big grass disc, darker towards the forest
	const ground = new Mesh(kit.geo(new CircleGeometry(110, 64)), grassMaterial(kit.d, 22));
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	group.add(ground);

	// paths: soft-edged strips along every walkable edge, round joints at the nodes
	const pathMat = pathMaterial(kit.d);
	const jointMat = pathJointMaterial(kit.d);
	const walkable = EDGES.filter(([a, b]) => {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		return !(p.inside && n.inside) && !(p.dock && n.dock);
	});
	const jointNodes = new Set<string>();
	for (const [a, b] of walkable) {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		const length = Math.hypot(n.x - p.x, n.z - p.z);
		const geometry = kit.geo(new PlaneGeometry(2.3, length + 0.6));
		// the earth repeats every two metres along the path
		const uv = geometry.attributes.uv;
		for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (length / 2));
		const strip = new Mesh(geometry, pathMat);
		strip.rotation.set(-Math.PI / 2, 0, Math.atan2(n.x - p.x, n.z - p.z) + Math.PI);
		strip.position.set((p.x + n.x) / 2, 0.02, (p.z + n.z) / 2);
		strip.receiveShadow = true;
		group.add(strip);
		jointNodes.add(a).add(b);
	}
	const jointGeo = kit.geo(new CircleGeometry(1.25, 20));
	for (const id of jointNodes) {
		const n = NODES.get(id)!;
		if (Math.hypot(n.x, n.z) < PLAZA.r) continue;
		const joint = new Mesh(jointGeo, jointMat);
		joint.rotation.x = -Math.PI / 2;
		joint.position.set(n.x, 0.021, n.z);
		joint.receiveShadow = true;
		group.add(joint);
	}
	// stepping stones scattered along the paths
	const stones: Placement[] = [];
	for (const [a, b] of walkable) {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		const steps = Math.floor((Math.hypot(n.x - p.x, n.z - p.z) / 5) * density);
		for (let i = 0; i < steps; i++) {
			const k = (i + 0.5) / Math.max(steps, 1);
			stones.push({
				x: p.x + (n.x - p.x) * k + (random() - 0.5) * 1.6,
				z: p.z + (n.z - p.z) * k + (random() - 0.5) * 1.6,
				rotation: random() * 6,
				scale: 0.5 + random() * 0.3
			});
		}
	}
	group.add(
		kits.nature.instanced(
			'RockPath_Round_Small_1',
			stones.filter((_, i) => i % 2 === 0),
			track,
			false
		)
	);
	group.add(
		kits.nature.instanced(
			'RockPath_Round_Small_2',
			stones.filter((_, i) => i % 2 === 1),
			track,
			false
		)
	);

	// the plaza: cobbles, a stone rim, a fountain, benches and flower pots
	const cobbles: Placement[] = [];
	for (let x = -PLAZA.r + 1; x < PLAZA.r; x += 2)
		for (let z = -PLAZA.r + 1; z < PLAZA.r; z += 2)
			if (Math.hypot(x, z) < PLAZA.r - 0.6)
				cobbles.push({ x: PLAZA.x + x, y: 0.03, z: PLAZA.z + z });
	group.add(kits.village.instanced('Floor_UnevenBrick', cobbles, track, false));
	const rockTrim = kits.village.material('MI_RockTrim') ?? kit.mat(0x9d968a);
	const rimRing = new Mesh(
		kit.geo(new CylinderGeometry(PLAZA.r + 0.3, PLAZA.r + 0.4, 0.12, 64, 1, true)),
		rockTrim
	);
	rimRing.position.set(PLAZA.x, 0.06, PLAZA.z);
	group.add(rimRing);
	const basin = kit.cylinder(PLAZA.fountain, PLAZA.fountain + 0.25, 0.65, rockTrim, 32);
	basin.position.set(PLAZA.x, 0.32, PLAZA.z);
	basin.castShadow = true;
	group.add(basin);
	const fountainWater = waterMaterial(kit.d, 0x3f9fc8, 0xc8f0ff);
	const basinWater = new Mesh(
		kit.geo(new CircleGeometry(PLAZA.fountain - 0.15, 32)),
		fountainWater.material
	);
	basinWater.rotation.x = -Math.PI / 2;
	basinWater.position.set(PLAZA.x, 0.6, PLAZA.z);
	group.add(basinWater);
	const column = kit.cylinder(0.25, 0.35, 1.7, rockTrim, 12);
	column.position.set(PLAZA.x, 0.85, PLAZA.z);
	column.castShadow = true;
	group.add(column);
	const bowl = kit.cylinder(0.95, 0.3, 0.32, rockTrim, 24);
	bowl.position.set(PLAZA.x, 1.7, PLAZA.z);
	bowl.castShadow = true;
	group.add(bowl);
	const drops = new InstancedMesh(
		kit.geo(new SphereGeometry(0.05, 6, 4)),
		kit.basic(0xd8f4ff, { transparent: true, opacity: 0.85 }),
		48
	);
	drops.frustumCulled = false;
	track(drops);
	group.add(drops);

	const wood = kits.village.material('MI_WoodTrim') ?? kit.mat(0x8a5a35);
	const benchIds = ['bench1', 'bench3', 'bench5', 'bench7'];
	for (const id of benchIds) {
		const n = NODES.get(id)!;
		const angle = Math.atan2(n.x, n.z);
		const bench = kit.group('bench');
		bench.add(kit.box(1.8, 0.08, 0.5, wood, 0, 0.45, 0));
		bench.add(kit.box(1.8, 0.4, 0.07, wood, 0, 0.6, 0.24));
		for (const x of [-0.75, 0.75])
			bench.add(kit.box(0.08, 0.45, 0.45, kit.mat(0x2f3338, { metalness: 0.6 }), x, 0, 0));
		bench.position.set(n.x * 1.12, 0.03, n.z * 1.12);
		bench.rotation.y = angle;
		bench.traverse((c) => (c.castShadow = true));
		group.add(bench);
	}
	const potMat = kit.mat(0xb4653a, { roughness: 0.9 });
	const pots: Placement[] = [];
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI) / 4;
		const x = PLAZA.x + Math.cos(a) * (PLAZA.r - 0.5);
		const z = PLAZA.z + Math.sin(a) * (PLAZA.r - 0.5);
		if (nearPath(x, z, 1.4)) continue;
		const pot = kit.cylinder(0.35, 0.25, 0.5, potMat, 12);
		pot.position.set(x, 0.28, z);
		pot.castShadow = true;
		group.add(pot);
		pots.push({ x, y: 0.5, z, rotation: k, scale: 0.35 });
	}
	group.add(kits.nature.instanced('Flower_3_Group', pots, track, false));

	// lamp posts around the plaza and beside longer paths
	const lampSpots: [number, number][] = [];
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI) / 4 + Math.PI / 8;
		lampSpots.push([Math.cos(a) * (PLAZA.r + 0.9), Math.sin(a) * (PLAZA.r + 0.9)]);
	}
	for (const [a, b] of walkable) {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		const length = Math.hypot(n.x - p.x, n.z - p.z);
		if (length < 6.5) continue;
		const nx = -(n.z - p.z) / length;
		const nz = (n.x - p.x) / length;
		const x = (p.x + n.x) / 2 + nx * 1.6;
		const z = (p.z + n.z) / 2 + nz * 1.6;
		const nearDoor = Object.values(BUILDINGS).some((bd) => {
			const door = NODES.get(bd.door)!;
			return Math.hypot(x - door.x, z - door.z) < 5;
		});
		if (!inPond(x, z) && !nearDoor && !Object.values(BUILDINGS).some((bd) => inRect(x, z, bd, 0.5)))
			lampSpots.push([x, z]);
	}
	const iron = kit.mat(0x2a2d31, { metalness: 0.6, roughness: 0.4 });
	const posts = new InstancedMesh(
		kit.geo(new CylinderGeometry(0.07, 0.1, 3.2, 8)),
		iron,
		lampSpots.length
	);
	const heads = new InstancedMesh(kit.boxGeo(0.34, 0.45, 0.34), iron, lampSpots.length);
	const lanternMat = kit.mat(0xfff1c1, { emissive: 0xffb45c, emissiveIntensity: 0 });
	const lanterns = new InstancedMesh(kit.boxGeo(0.26, 0.34, 0.26), lanternMat, lampSpots.length);
	const glowMat = glowMaterial(kit.d);
	lampSpots.forEach(([x, z], i) => {
		m.makeTranslation(x, 1.6, z);
		posts.setMatrixAt(i, m);
		m.makeTranslation(x, 3.35, z);
		heads.setMatrixAt(i, m);
		m.makeTranslation(x, 3.3, z);
		lanterns.setMatrixAt(i, m);
		const halo = new Sprite(glowMat);
		halo.position.set(x, 3.3, z);
		halo.scale.setScalar(1.6);
		group.add(halo);
	});
	for (const mesh of [posts, heads, lanterns]) {
		mesh.castShadow = mesh !== lanterns;
		track(mesh);
		group.add(mesh);
	}
	// real lights only on the lamps nearest the camera
	const lampLights = Array.from({ length: 4 }, () => {
		const light = new PointLight(0xffb86b, 0, 14, 1.7);
		group.add(light);
		return light;
	});
	let lampPick = 0;

	// the pond: water, a sandy shore, lily pads, reeds, a dock and a boat
	const pondWater = waterMaterial(kit.d);
	const pond = new Mesh(kit.geo(new CircleGeometry(1, 64)), pondWater.material);
	pond.rotation.x = -Math.PI / 2;
	pond.scale.set(POND.rx, POND.rz, 1);
	pond.position.set(POND.x, 0.04, POND.z);
	setPick(pond, { kind: 'room', id: 'pond' });
	group.add(pond);
	const shore = new Mesh(kit.geo(new CircleGeometry(1, 64)), kit.mat(0xd8c28f, { roughness: 1 }));
	shore.rotation.x = -Math.PI / 2;
	shore.scale.set(POND.rx + 1, POND.rz + 1, 1);
	shore.position.set(POND.x, 0.012, POND.z);
	shore.receiveShadow = true;
	group.add(shore);
	const padGeo = kit.geo(new CircleGeometry(0.45, 16, 0.4, Math.PI * 2 - 0.6));
	const padMat = kit.mat(0x4e8c3a, { roughness: 0.8, side: 2 });
	const pads: Placement[] = [];
	while (pads.length < 26 * density) {
		const a = random() * Math.PI * 2;
		const r = 0.45 + random() * 0.45;
		const x = POND.x + Math.cos(a) * POND.rx * r;
		const z = POND.z + Math.sin(a) * POND.rz * r;
		if (!inRect(x, z, DOCK, 1.2) && !inRect(x, z, { x: 22, z: 14.2, w: 6, d: 3 }, 0.8))
			pads.push({ x, z, rotation: random() * 6, scale: 0.7 + random() * 0.6 });
	}
	const padMesh = new InstancedMesh(padGeo, padMat, pads.length);
	pads.forEach((p, i) => {
		q.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2).premultiply(
			new Quaternion().setFromAxisAngle(up, p.rotation ?? 0)
		);
		m.compose(new Vector3(p.x, 0.06, p.z), q, new Vector3(p.scale, p.scale, p.scale));
		padMesh.setMatrixAt(i, m);
	});
	track(padMesh);
	group.add(padMesh);
	const reeds: Placement[] = [];
	for (let i = 0; i < 40 * density; i++) {
		const a = random() * Math.PI * 2;
		const x = POND.x + Math.cos(a) * (POND.rx + 0.2);
		const z = POND.z + Math.sin(a) * (POND.rz + 0.2);
		if (!inRect(x, z, DOCK, 1.5) && !nearPath(x, z, 1))
			reeds.push({ x, z, rotation: random() * 6, scale: 0.55 + random() * 0.3 });
	}
	group.add(kits.nature.instanced('Grass_Wispy_Tall', reeds, track));
	const planks = new InstancedMesh(
		kit.boxGeo(0.5, 0.08, DOCK.d + 0.2),
		wood,
		Math.round(DOCK.w / 0.55)
	);
	for (let i = 0; i < planks.count; i++) {
		m.makeTranslation(DOCK.x - DOCK.w / 2 + 0.3 + i * 0.55, 0.32, DOCK.z);
		planks.setMatrixAt(i, m);
	}
	planks.castShadow = true;
	planks.receiveShadow = true;
	track(planks);
	group.add(planks);
	for (const k of [0, 0.5, 1])
		for (const side of [-1, 1]) {
			const pile = kit.cylinder(0.09, 0.09, 0.8, wood, 8);
			pile.position.set(
				DOCK.x - DOCK.w / 2 + 0.6 + k * (DOCK.w - 1),
				0.15,
				DOCK.z + (side * (DOCK.d + 0.2)) / 2
			);
			group.add(pile);
		}
	const boat = kit.group('boat');
	const hullMat = kit.mat(0xa4532e, { roughness: 0.8 });
	boat.add(kit.box(1.1, 0.4, 2.4, hullMat, 0, 0, 0));
	const bow = kit.cylinder(0.55, 0.05, 0.9, hullMat, 4);
	bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
	bow.scale.set(1, 1, 0.55);
	bow.position.set(0, 0.2, 1.6);
	boat.add(bow);
	boat.add(kit.box(1.0, 0.06, 0.28, wood, 0, 0.36, 0.4));
	boat.add(kit.box(1.0, 0.06, 0.28, wood, 0, 0.36, -0.6));
	const oar = kit.box(0.06, 0.04, 2, wood, 0.7, 0.42, 0);
	oar.rotation.y = 0.35;
	boat.add(oar);
	boat.position.set(DOCK.x + 1.2, 0.05, DOCK.z + 1.5);
	boat.rotation.y = 0.25;
	boat.traverse((c) => (c.castShadow = true));
	group.add(boat);

	// the garden plots: dry-stone walls with a gate, vegetable rows, crates and barrels
	const wallStones: Placement[] = [];
	const rows: Placement[] = [];
	const leafy: Placement[] = [];
	for (const plot of PLOTS) {
		const bed = kit.box(
			plot.w - 0.5,
			0.1,
			plot.d - 0.5,
			kit.mat(0x6b4a2e, { roughness: 1 }),
			plot.x,
			0,
			plot.z
		);
		bed.receiveShadow = true;
		group.add(bed);
		for (let r = 0; r < 4; r++) {
			const z = plot.z - plot.d / 2 + 0.9 + r * ((plot.d - 1.8) / 3);
			for (let k = 0; k < 7; k++) {
				const spot = {
					x: plot.x - (plot.w - 1.4) / 2 + (k * (plot.w - 1.4)) / 6,
					y: 0.08,
					z,
					rotation: k + r,
					scale: 0.45
				};
				(r % 2 ? rows : leafy).push(spot);
			}
		}
		addWallStones(plot, wallStones, random);
	}
	group.add(
		kits.nature.instanced(
			'Pebble_Square_1',
			wallStones.filter((_, i) => i % 3 === 0),
			track
		)
	);
	group.add(
		kits.nature.instanced(
			'Pebble_Square_2',
			wallStones.filter((_, i) => i % 3 === 1),
			track
		)
	);
	group.add(
		kits.nature.instanced(
			'Pebble_Square_3',
			wallStones.filter((_, i) => i % 3 === 2),
			track
		)
	);
	group.add(kits.nature.instanced('Clover_1', rows, track, false));
	group.add(kits.nature.instanced('Plant_1', leafy, track, false));
	const barrelMat = kit.mat(0x7a4b2a, { roughness: 0.85 });
	for (const plot of PLOTS) {
		const x = plot.x + plot.w / 2 + 0.9;
		const z = plot.z - plot.d / 2 + 0.8;
		group.add(kits.village.clone('Prop_Crate', x, 0, z, 0.4, 0.7));
		const barrel = kit.cylinder(0.38, 0.38, 0.95, barrelMat, 14);
		barrel.position.set(x, 0.48, z + 1.1);
		barrel.castShadow = true;
		group.add(barrel);
		for (const y of [0.18, 0.78]) {
			const hoop = kit.cylinder(0.4, 0.4, 0.05, iron, 14);
			hoop.position.set(x, y, z + 1.1);
			group.add(hoop);
		}
	}

	// nature: trees, bushes, flowers, grass and rocks on free ground; a forest ring at the edge
	const scatter = (count: number, rMin: number, rMax: number, margin: number) => {
		const out: Placement[] = [];
		let tries = 0;
		while (out.length < count && tries++ < count * 60) {
			const a = random() * Math.PI * 2;
			const r = rMin + Math.sqrt(random()) * (rMax - rMin);
			const x = Math.cos(a) * r;
			const z = Math.sin(a) * r;
			if (free(x, z, margin) && !out.some((p) => Math.hypot(p.x - x, p.z - z) < margin * 1.6))
				out.push({ x, z, rotation: random() * 6, scale: 0.75 + random() * 0.45 });
		}
		return out;
	};
	const trees = scatter(Math.round(46 * density), 10, 44, 2.2);
	const forest = scatter(Math.round(130 * density), 46, 85, 2.6);
	const treeKinds = [
		'CommonTree_1',
		'CommonTree_2',
		'CommonTree_3',
		'CommonTree_4',
		'Pine_1',
		'Pine_2',
		'Pine_3'
	];
	for (const [i, kind] of treeKinds.entries()) {
		group.add(
			kits.nature.instanced(
				kind,
				trees.filter((_, k) => k % treeKinds.length === i),
				track
			)
		);
	}
	// the forest ring, deep in the fog: cheap low-poly trees in the kit's colours, no shadows
	const crownMat = kit.mat(0x4f7d35, { roughness: 1, flatShading: true });
	const pineMat = kit.mat(0x2f5a33, { roughness: 1, flatShading: true });
	const far = (
		geometry: BufferGeometry,
		material: MeshStandardMaterial,
		list: Placement[],
		y: number
	) => {
		const mesh = new InstancedMesh(geometry, material, Math.max(list.length, 1));
		mesh.count = list.length;
		list.forEach((p, i) => {
			const s = (p.scale ?? 1) * 1.3;
			q.setFromAxisAngle(up, p.rotation ?? 0);
			m.compose(new Vector3(p.x, y * s, p.z), q, new Vector3(s, s, s));
			mesh.setMatrixAt(i, m);
		});
		track(mesh);
		group.add(mesh);
	};
	const rounds = forest.filter((_, k) => k % 2 === 0);
	const pines = forest.filter((_, k) => k % 2 === 1);
	far(kit.geo(new IcosahedronGeometry(2.6, 1)), crownMat, rounds, 4.4);
	far(kit.geo(new ConeGeometry(2.3, 6, 8)), pineMat, pines, 4.2);
	far(kit.geo(new CylinderGeometry(0.25, 0.35, 3, 6)), kit.mat(0x5b3d26), forest, 1.5);
	group.add(
		kits.nature.instanced(
			'TwistedTree_1',
			scatter(3, 30, 42, 6).map((p) => ({ ...p, scale: 0.55 })),
			track
		)
	);
	const bushes = scatter(Math.round(60 * density), 8, 46, 1);
	group.add(
		kits.nature.instanced(
			'Bush_Common',
			bushes.filter((_, i) => i % 2 === 0),
			track
		)
	);
	group.add(
		kits.nature.instanced(
			'Bush_Common_Flowers',
			bushes.filter((_, i) => i % 2 === 1),
			track
		)
	);
	const flowers = scatter(Math.round(50 * density), 8, 40, 0.6).map((p) => ({
		...p,
		scale: 0.3 + (p.scale ?? 1) * 0.15
	}));
	group.add(
		kits.nature.instanced(
			'Flower_3_Group',
			flowers.filter((_, i) => i % 2 === 0),
			track,
			false
		)
	);
	group.add(
		kits.nature.instanced(
			'Flower_4_Group',
			flowers.filter((_, i) => i % 2 === 1),
			track,
			false
		)
	);
	const tufts = scatter(Math.round(160 * density), 7.5, 48, 0.5).map((p) => ({
		...p,
		scale: 0.4 + (p.scale ?? 1) * 0.2
	}));
	group.add(kits.nature.instanced('Grass_Common_Short', tufts, track, false));
	group.add(
		kits.nature.instanced(
			'Fern_1',
			scatter(Math.round(24 * density), 12, 46, 1).map((p) => ({ ...p, scale: 0.6 })),
			track,
			false
		)
	);
	group.add(
		kits.nature.instanced(
			'Mushroom_Common',
			scatter(Math.round(16 * density), 12, 46, 0.6),
			track,
			false
		)
	);
	const rocks = scatter(Math.round(18 * density), 12, 60, 2).map((p) => ({
		...p,
		y: -0.15,
		scale: 0.35 + (p.scale ?? 1) * 0.25
	}));
	for (const [i, kind] of ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'].entries())
		group.add(
			kits.nature.instanced(
				kind,
				rocks.filter((_, k) => k % 3 === i),
				track
			)
		);

	// lights: sky, sun (the only shadows), fog
	const hemi = new HemisphereLight(0xffffff, 0x445533, 1);
	const ambient = new AmbientLight(0xffffff, 0.15);
	const sun = new DirectionalLight(0xffffff, 3);
	sun.castShadow = true;
	sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
	sun.shadow.camera.left = -38;
	sun.shadow.camera.right = 38;
	sun.shadow.camera.top = 38;
	sun.shadow.camera.bottom = -38;
	sun.shadow.camera.near = 1;
	sun.shadow.camera.far = 140;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.03;
	group.add(hemi, ambient, sun, sun.target);
	const sky = new Color();
	const fog = new Fog(0xffffff, 50, 130);
	scene.fog = fog;
	scene.background = sky;

	// the rig eases from where it is to the chosen one
	const current = {
		...rigFor(initial),
		sunPosition: [...rigFor(initial).sunPosition] as [number, number, number]
	};
	const colors = {
		sky: new Color(current.sky),
		fog: new Color(current.fog),
		sun: new Color(current.sun),
		hemiSky: new Color(current.hemiSky),
		hemiGround: new Color(current.hemiGround)
	};
	const target = new Color();
	const ease = (rig: Rig, dt: number) => {
		const k = 1 - Math.exp(-2.5 * dt);
		for (const key of ['sky', 'fog', 'sun', 'hemiSky', 'hemiGround'] as const)
			colors[key].lerp(target.setHex(rig[key]), k);
		for (const key of [
			'fogNear',
			'fogFar',
			'sunIntensity',
			'hemiIntensity',
			'exposure',
			'glow'
		] as const)
			current[key] += (rig[key] - current[key]) * k;
		for (let i = 0; i < 3; i++)
			current.sunPosition[i] += (rig.sunPosition[i] - current.sunPosition[i]) * k;
	};

	mergeStatic(group, kit);

	const dropState = Array.from({ length: drops.count }, (_, i) => ({
		t: i / drops.count,
		a: (i * 2.4) % (Math.PI * 2)
	}));
	const lampDistance = lampSpots.map(() => 0);
	const order = lampSpots.map((_, i) => i);
	const module: VillageModule = {
		group,
		sun,
		exposure: current.exposure,
		update(dt: number, ctx: FrameContext & { light?: LightMode }) {
			ease(rigFor(ctx.light ?? initial), dt);
			sky.copy(colors.sky);
			fog.color.copy(colors.fog);
			fog.near = current.fogNear;
			fog.far = current.fogFar;
			sun.color.copy(colors.sun);
			sun.intensity = current.sunIntensity;
			sun.position.set(...current.sunPosition);
			hemi.color.copy(colors.hemiSky);
			hemi.groundColor.copy(colors.hemiGround);
			hemi.intensity = current.hemiIntensity;
			module.exposure = current.exposure;

			lanternMat.emissiveIntensity = 0.3 + ctx.glow * 4;
			// halos only once it's dark
			glowMat.opacity = Math.max(0, ctx.glow - 0.4) * 0.9;
			// the four lamps nearest the camera get real light
			lampPick -= dt;
			if (lampPick <= 0) {
				lampPick = 0.4;
				lampSpots.forEach(
					([x, z], i) => (lampDistance[i] = Math.hypot(x - ctx.camera.x, z - ctx.camera.z))
				);
				order.sort((a, b) => lampDistance[a] - lampDistance[b]);
				lampLights.forEach((light, i) => {
					const spot = lampSpots[order[i]];
					if (spot) light.position.set(spot[0], 3.1, spot[1]);
				});
			}
			for (const light of lampLights) light.intensity = ctx.glow * 14;

			fountainWater.update(ctx.time * 3);
			pondWater.update(ctx.time);
			dropState.forEach((drop, i) => {
				drop.t = (drop.t + dt * 0.7) % 1;
				const r = drop.t * 1.15;
				const y = 1.9 + Math.sin(drop.t * Math.PI) * 0.9 - drop.t * 0.75;
				m.makeTranslation(PLAZA.x + Math.cos(drop.a) * r, y, PLAZA.z + Math.sin(drop.a) * r);
				drops.setMatrixAt(i, m);
			});
			drops.instanceMatrix.needsUpdate = true;
		},
		dispose() {
			scene.fog = null;
			scene.background = null;
			sun.dispose();
			for (const mesh of instances) mesh.dispose();
			kit.dispose();
		}
	};
	return module;
}

/** stones along a plot's four sides, two courses high, a 1.6 m gate on the side towards the path */
function addWallStones(plot: Rect, out: Placement[], random: () => number) {
	const x0 = plot.x - plot.w / 2;
	const x1 = plot.x + plot.w / 2;
	const z0 = plot.z - plot.d / 2;
	const z1 = plot.z + plot.d / 2;
	const gateNorth = plot.z > 0;
	const sides: [number, number, number, number, boolean][] = [
		[x0, z0, x1, z0, gateNorth],
		[x0, z1, x1, z1, !gateNorth],
		[x0, z0, x0, z1, false],
		[x1, z0, x1, z1, false]
	];
	for (const [ax, az, bx, bz, gate] of sides) {
		const length = Math.hypot(bx - ax, bz - az);
		for (let s = 0; s < length; s += 0.38) {
			if (gate && Math.abs(s - length / 2) < 0.8) continue;
			const k = s / length;
			for (let course = 0; course < 2; course++)
				out.push({
					x: ax + (bx - ax) * k + (random() - 0.5) * 0.08,
					y: course * 0.13,
					z: az + (bz - az) * k + (random() - 0.5) * 0.08,
					rotation: random() * 6,
					scale: 1 + random() * 0.4
				});
		}
	}
}
