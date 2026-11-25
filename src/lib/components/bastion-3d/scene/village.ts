/**
 * The village around the buildings: grass, dirt paths along the walking
 * graph, the plaza with its fountain and benches, lamp posts that light up
 * at twilight, trees, bushes and flowers (instanced), the pond with its dock
 * and a boat, the walled garden plots, and the day / twilight light rigs
 * (one shadow-casting sun).
 */
import {
	AmbientLight,
	CircleGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	DirectionalLight,
	DodecahedronGeometry,
	Fog,
	HemisphereLight,
	IcosahedronGeometry,
	InstancedMesh,
	Matrix4,
	Mesh,
	PointLight,
	Quaternion,
	SphereGeometry,
	Vector3,
	type Material,
	type BufferGeometry,
	type Scene
} from 'three';
import { Kit, damp, lerp, setPick, type SceneModule } from './common';
import { BUILDINGS, DOCK, EDGES, NODES, PLAZA, PLOTS, POND, type Rect } from '$lib/village/layout';
import { inPond, inRect } from '$lib/village/navigation';

/** a small seeded random, so the trees stand in the same places every time */
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

/** a free spot for scenery: off the paths, the plaza, the pond and the buildings */
function free(x: number, z: number, margin = 1.5) {
	if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + margin) return false;
	if (inPond(x, z) || inPond(x - margin, z) || inPond(x + margin, z)) return false;
	for (const b of Object.values(BUILDINGS)) if (inRect(x, z, b, margin + 1)) return false;
	for (const plot of PLOTS) if (inRect(x, z, plot, margin)) return false;
	return !nearPath(x, z, margin + 0.6);
}

export function buildVillage(scene: Scene): SceneModule {
	const kit = new Kit();
	const group = kit.group('village');
	const instances: InstancedMesh[] = [];
	const instanced = (geometry: BufferGeometry, material: Material, count: number) => {
		const mesh = new InstancedMesh(geometry, material, count);
		instances.push(mesh);
		group.add(mesh);
		return mesh;
	};
	const m = new Matrix4();
	const q = new Quaternion();
	const up = new Vector3(0, 1, 0);
	const put = (
		mesh: InstancedMesh,
		i: number,
		x: number,
		y: number,
		z: number,
		s = 1,
		rot = 0,
		sy = s
	) => {
		q.setFromAxisAngle(up, rot);
		m.compose(new Vector3(x, y, z), q, new Vector3(s, sy, s));
		mesh.setMatrixAt(i, m);
	};

	// ground
	const grassMat = kit.mat(0x6fa35a, { roughness: 1 });
	const ground = new Mesh(kit.geo(new CircleGeometry(90, 48)), grassMat);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	group.add(ground);

	// paths: one flattened box per edge outside the buildings and off the dock
	const dirt = kit.mat(0xc9a878, { roughness: 1 });
	const walkable = EDGES.filter(([a, b]) => {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		return !(p.inside && n.inside) && !(p.dock && n.dock);
	});
	const paths = instanced(kit.boxGeo(1, 0.04, 1), dirt, walkable.length * 2);
	walkable.forEach(([a, b], i) => {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		const length = Math.hypot(n.x - p.x, n.z - p.z);
		const angle = Math.atan2(n.x - p.x, n.z - p.z);
		q.setFromAxisAngle(up, angle);
		m.compose(
			new Vector3((p.x + n.x) / 2, 0.02, (p.z + n.z) / 2),
			q,
			new Vector3(1.9, 1, length + 0.6)
		);
		paths.setMatrixAt(i * 2, m);
		// a round end at each node, so corners close
		m.compose(new Vector3(n.x, 0.021, n.z), q, new Vector3(1.9, 1, 1.9));
		paths.setMatrixAt(i * 2 + 1, m);
	});
	paths.receiveShadow = true;

	// the plaza: stone disc, fountain, benches
	const stone = kit.mat(0xb9b2a6, { roughness: 0.95 });
	const plaza = new Mesh(kit.geo(new CylinderGeometry(PLAZA.r, PLAZA.r, 0.08, 48)), stone);
	plaza.position.set(PLAZA.x, 0.04, PLAZA.z);
	plaza.receiveShadow = true;
	group.add(plaza);
	const rim = new Mesh(
		kit.geo(new CylinderGeometry(PLAZA.fountain, PLAZA.fountain + 0.2, 0.6, 32)),
		kit.mat(0x9d968a)
	);
	rim.position.set(PLAZA.x, 0.3, PLAZA.z);
	rim.castShadow = true;
	group.add(rim);
	const waterMat = kit.mat(0x5fb7e0, {
		roughness: 0.1,
		metalness: 0.1,
		emissive: 0x1d5f8a,
		emissiveIntensity: 0.3
	});
	const fountainWater = new Mesh(kit.geo(new CircleGeometry(PLAZA.fountain - 0.15, 32)), waterMat);
	fountainWater.rotation.x = -Math.PI / 2;
	fountainWater.position.set(PLAZA.x, 0.55, PLAZA.z);
	group.add(fountainWater);
	const column = kit.cylinder(0.25, 0.35, 1.6, kit.mat(0x9d968a), 12);
	column.position.set(PLAZA.x, 0.8, PLAZA.z);
	group.add(column);
	const bowl = kit.cylinder(0.9, 0.3, 0.3, kit.mat(0x9d968a), 20);
	bowl.position.set(PLAZA.x, 1.6, PLAZA.z);
	bowl.castShadow = true;
	group.add(bowl);
	// the jet: a few drops arcing out of the bowl
	const drops = instanced(
		kit.geo(new SphereGeometry(0.06, 6, 4)),
		kit.basic(0xbfe8ff, { transparent: true, opacity: 0.8 }),
		36
	);

	const wood = kit.mat(0x8a5a35, { roughness: 0.9 });
	const benchIds = ['bench1', 'bench3', 'bench5', 'bench7'];
	const seats = instanced(kit.boxGeo(1.6, 0.08, 0.5), wood, benchIds.length);
	const backs = instanced(kit.boxGeo(1.6, 0.45, 0.08), wood, benchIds.length);
	benchIds.forEach((id, i) => {
		const n = NODES.get(id)!;
		// a little further out than the spot, facing the fountain
		const angle = Math.atan2(n.x, n.z);
		const x = n.x * 1.12;
		const z = n.z * 1.12;
		put(seats, i, x, 0.45, z, 1, angle);
		put(backs, i, x + Math.sin(angle) * 0.25, 0.72, z + Math.cos(angle) * 0.25, 1, angle);
	});

	// lamp posts along the paths and around the plaza
	const lampSpots: [number, number][] = [];
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI) / 4 + Math.PI / 8;
		lampSpots.push([Math.cos(a) * (PLAZA.r + 0.6), Math.sin(a) * (PLAZA.r + 0.6)]);
	}
	for (const [a, b] of walkable) {
		const p = NODES.get(a)!;
		const n = NODES.get(b)!;
		const length = Math.hypot(n.x - p.x, n.z - p.z);
		if (length < 5) continue;
		// beside the middle of longer stretches
		const nx = -(n.z - p.z) / length;
		const nz = (n.x - p.x) / length;
		const x = (p.x + n.x) / 2 + nx * 1.5;
		const z = (p.z + n.z) / 2 + nz * 1.5;
		if (!inPond(x, z) && !Object.values(BUILDINGS).some((bd) => inRect(x, z, bd, 0.5)))
			lampSpots.push([x, z]);
	}
	const iron = kit.mat(0x2f3338, { metalness: 0.6, roughness: 0.4 });
	const posts = instanced(kit.geo(new CylinderGeometry(0.06, 0.09, 3, 8)), iron, lampSpots.length);
	const bulbMat = kit.mat(0xfff1c1, { emissive: 0xffc56b, emissiveIntensity: 0 });
	const bulbs = instanced(kit.geo(new SphereGeometry(0.18, 10, 8)), bulbMat, lampSpots.length);
	lampSpots.forEach(([x, z], i) => {
		put(posts, i, x, 1.5, z);
		put(bulbs, i, x, 3.05, z);
	});
	posts.castShadow = true;
	// a few real lights for the twilight glow (the rest only shine)
	const lampLights = [0, 2, 4, 6].map((k) => {
		const light = new PointLight(0xffc56b, 0, 14, 1.6);
		light.position.set(lampSpots[k][0], 3, lampSpots[k][1]);
		group.add(light);
		return light;
	});

	// the pond, its dock and a boat
	const pondMat = kit.mat(0x3f8fbf, {
		roughness: 0.15,
		metalness: 0.1,
		emissive: 0x0c3550,
		emissiveIntensity: 0.25
	});
	const pond = new Mesh(kit.geo(new CircleGeometry(1, 48)), pondMat);
	pond.rotation.x = -Math.PI / 2;
	pond.scale.set(POND.rx, POND.rz, 1);
	pond.position.set(POND.x, 0.03, POND.z);
	setPick(pond, { kind: 'room', id: 'pond' });
	group.add(pond);
	const shore = new Mesh(kit.geo(new CircleGeometry(1, 48)), kit.mat(0xd9c79a, { roughness: 1 }));
	shore.rotation.x = -Math.PI / 2;
	shore.scale.set(POND.rx + 0.8, POND.rz + 0.8, 1);
	shore.position.set(POND.x, 0.015, POND.z);
	group.add(shore);
	const planks = instanced(kit.boxGeo(0.5, 0.08, DOCK.d), wood, Math.round(DOCK.w / 0.55));
	for (let i = 0; i < planks.count; i++)
		put(planks, i, DOCK.x - DOCK.w / 2 + 0.3 + i * 0.55, 0.28, DOCK.z);
	planks.castShadow = true;
	const piles = instanced(kit.geo(new CylinderGeometry(0.08, 0.08, 0.7, 6)), wood, 6);
	[0, 0.5, 1].forEach((k, i) => {
		put(piles, i * 2, DOCK.x - DOCK.w / 2 + 0.6 + k * (DOCK.w - 1), 0.1, DOCK.z - DOCK.d / 2);
		put(piles, i * 2 + 1, DOCK.x - DOCK.w / 2 + 0.6 + k * (DOCK.w - 1), 0.1, DOCK.z + DOCK.d / 2);
	});
	const boat = kit.group('boat');
	boat.add(kit.box(1.1, 0.35, 2.6, kit.mat(0xb5532e), 0, 0, 0));
	boat.add(kit.box(0.9, 0.06, 0.3, wood, 0, 0.3, 0.3));
	boat.position.set(DOCK.x + 1, 0.05, DOCK.z + 1.4);
	boat.rotation.y = 0.2;
	group.add(boat);

	// walled garden plots: soil, crop rows, low stone walls with a gate on the path side
	const soil = kit.mat(0x6b4a2e, { roughness: 1 });
	const crop = kit.mat(0x4f9a3c, { roughness: 1 });
	const wallStone = kit.mat(0xa59f93, { roughness: 1 });
	const wallSegments: [number, number, number, number][] = [];
	const rows: [number, number, number][] = [];
	for (const plot of PLOTS) {
		const bed = kit.box(plot.w - 0.4, 0.08, plot.d - 0.4, soil, plot.x, 0, plot.z);
		bed.receiveShadow = true;
		group.add(bed);
		for (let r = 0; r < 4; r++)
			rows.push([plot.x, plot.z - plot.d / 2 + 0.9 + r * ((plot.d - 1.8) / 3), plot.w - 1.2]);
		addWalls(plot, wallSegments);
	}
	const wallMesh = instanced(kit.boxGeo(1, 0.6, 0.3), wallStone, wallSegments.length);
	wallSegments.forEach(([x, z, length, angle], i) => {
		q.setFromAxisAngle(up, angle);
		m.compose(new Vector3(x, 0.3, z), q, new Vector3(length, 1, 1));
		wallMesh.setMatrixAt(i, m);
	});
	wallMesh.castShadow = true;
	const cropMesh = instanced(kit.geo(new SphereGeometry(0.25, 6, 4)), crop, rows.length * 8);
	let c = 0;
	for (const [x, z, length] of rows)
		for (let k = 0; k < 8; k++)
			put(cropMesh, c++, x - length / 2 + (k * length) / 7, 0.2, z, 1, 0, 0.8);

	// trees, bushes and flowers on free ground
	const random = seeded(42);
	const treeSpots: [number, number, number][] = [];
	while (treeSpots.length < 70) {
		const a = random() * Math.PI * 2;
		const r = 9 + random() * 42;
		const x = Math.cos(a) * r;
		const z = Math.sin(a) * r;
		if (free(x, z, 2) && !treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3))
			treeSpots.push([x, z, 0.8 + random() * 0.6]);
	}
	const trunkMat = kit.mat(0x7a5233);
	const trunks = instanced(
		kit.geo(new CylinderGeometry(0.18, 0.26, 1.6, 6)),
		trunkMat,
		treeSpots.length
	);
	const leafRound = kit.mat(0x4c8f3d, { roughness: 1, flatShading: true });
	const leafPine = kit.mat(0x2f6e3a, { roughness: 1, flatShading: true });
	const rounds = treeSpots.filter((_, i) => i % 3 !== 0);
	const pines = treeSpots.filter((_, i) => i % 3 === 0);
	const crowns = instanced(kit.geo(new IcosahedronGeometry(1.4, 0)), leafRound, rounds.length);
	const cones = instanced(kit.geo(new ConeGeometry(1.2, 3, 7)), leafPine, pines.length);
	treeSpots.forEach(([x, z, s], i) => put(trunks, i, x, 0.8 * s, z, s));
	rounds.forEach(([x, z, s], i) => put(crowns, i, x, 2.5 * s, z, s, x));
	pines.forEach(([x, z, s], i) => put(cones, i, x, 2.9 * s, z, s, z));
	for (const mesh of [trunks, crowns, cones]) mesh.castShadow = true;

	const bushSpots: [number, number][] = [];
	while (bushSpots.length < 60) {
		const x = (random() - 0.5) * 70;
		const z = (random() - 0.5) * 70;
		if (free(x, z, 0.6)) bushSpots.push([x, z]);
	}
	const bushes = instanced(
		kit.geo(new DodecahedronGeometry(0.55, 0)),
		kit.mat(0x5a9e44, { flatShading: true }),
		bushSpots.length
	);
	bushSpots.forEach(([x, z], i) => put(bushes, i, x, 0.35, z, 0.8 + (i % 4) * 0.15, i));
	bushes.castShadow = true;

	const flowerSpots: [number, number][] = [];
	while (flowerSpots.length < 220) {
		const x = (random() - 0.5) * 60;
		const z = (random() - 0.5) * 60;
		if (free(x, z, 0.4)) flowerSpots.push([x, z]);
	}
	const flowers = instanced(
		kit.geo(new SphereGeometry(0.12, 5, 4)),
		kit.mat(0xffffff, { roughness: 0.8 }),
		flowerSpots.length
	);
	const palette = [0xf472b6, 0xfde047, 0xffffff, 0xa78bfa, 0xfb923c, 0xf87171].map(
		(hex) => new Color(hex)
	);
	flowerSpots.forEach(([x, z], i) => {
		put(flowers, i, x, 0.15, z);
		flowers.setColorAt(i, palette[i % palette.length]);
	});

	for (const mesh of instances) {
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}

	// lights: a sky, a sun that casts the only shadows, fog
	const hemi = new HemisphereLight(0xcfe8ff, 0x4b6b3a, 0.9);
	const ambient = new AmbientLight(0x8090c0, 0.3);
	const sun = new DirectionalLight(0xfff1d6, 2.4);
	sun.position.set(30, 45, 20);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -45;
	sun.shadow.camera.right = 45;
	sun.shadow.camera.top = 45;
	sun.shadow.camera.bottom = -45;
	sun.shadow.camera.far = 140;
	sun.shadow.bias = -0.0005;
	group.add(hemi, ambient, sun, sun.target);

	const twilightSky = new Color(0x1a1d3a);
	const daySky = new Color(0xa9d4f5);
	const sky = new Color();
	const fog = new Fog(0x1a1d3a, 60, 160);
	scene.fog = fog;
	scene.background = sky;

	const dropState = Array.from({ length: drops.count }, (_, i) => ({
		t: i / drops.count,
		a: (i * 2.4) % (Math.PI * 2)
	}));
	return {
		group,
		update(dt, ctx) {
			const day = ctx.day;
			const night = 1 - day;
			sky.copy(twilightSky).lerp(daySky, day);
			fog.color.copy(sky);
			hemi.intensity = lerp(0.55, 1.0, day);
			ambient.intensity = lerp(0.35, 0.3, day);
			sun.intensity = lerp(0.35, 2.4, day);
			sun.color.setHex(day > 0.5 ? 0xfff1d6 : 0x9aa6ff);
			bulbMat.emissiveIntensity = damp(bulbMat.emissiveIntensity, night * 3, 3, dt);
			for (const light of lampLights) light.intensity = bulbMat.emissiveIntensity * 6;
			waterMat.emissiveIntensity = 0.2 + night * 0.4;
			pondMat.emissiveIntensity = 0.15 + night * 0.25;
			// the fountain's drops
			dropState.forEach((drop, i) => {
				drop.t = (drop.t + dt * 0.7) % 1;
				const r = drop.t * 1.1;
				const y = 1.8 + Math.sin(drop.t * Math.PI) * 0.9 - drop.t * 0.6;
				put(drops, i, PLAZA.x + Math.cos(drop.a) * r, y, PLAZA.z + Math.sin(drop.a) * r);
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
}

/** a plot's four walls as segments, with a 1.6 m gate in the side nearest the path */
function addWalls(plot: Rect, out: [number, number, number, number][]) {
	const x0 = plot.x - plot.w / 2;
	const x1 = plot.x + plot.w / 2;
	const z0 = plot.z - plot.d / 2;
	const z1 = plot.z + plot.d / 2;
	// the gate faces the plot's gate node: the side closest to the nearest path node
	const gateNorth = plot.z > 0; // plot_b's gate is north of it, plot_a's south
	const sides: [number, number, number, number, boolean][] = [
		[x0, z0, x1, z0, gateNorth],
		[x0, z1, x1, z1, !gateNorth],
		[x0, z0, x0, z1, false],
		[x1, z0, x1, z1, false]
	];
	for (const [ax, az, bx, bz, gate] of sides) {
		const length = Math.hypot(bx - ax, bz - az);
		const angle = Math.atan2(bz - az, bx - ax);
		const pieces: [number, number][] = gate
			? [
					[0, length / 2 - 0.8],
					[length / 2 + 0.8, length]
				]
			: [[0, length]];
		for (const [from, to] of pieces) {
			const mid = (from + to) / 2;
			out.push([ax + Math.cos(angle) * mid, az + Math.sin(angle) * mid, to - from, -angle]);
		}
	}
}
