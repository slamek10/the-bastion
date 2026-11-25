/**
 * Builds a house from the village kit on its 2 m grid, in the building's own
 * space (front, with the door, at +z): stone-based walls with round-topped
 * windows and a door, wooden corner posts, a tiled gable roof with brick
 * gable ends, a chimney, vines and window boxes. Its windows get their own
 * glass material, so they can glow, and the roof and front can fade.
 */
import {
	Group,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	type BufferGeometry,
	type Material
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { KitSet } from './kits';
import { glowOnly, type Kit } from './common';

export const STOREY = 3.12;
/** where a wall piece's outside face is, from its origin */
const FACE = 0.09;

export interface HouseSpec {
	/** width across the door side and depth, metres, multiples of 2 */
	w: number;
	d: number;
	style: 'plaster' | 'brick';
	/** the roof piece (Roof_RoundTiles_<w>x<d>) and gable end (Roof_Front_Brick<w>) */
	roof?: string;
	gable?: string;
	/** extra storeys below the roof */
	storeys?: number;
	/** chimney spot in building space, or none */
	chimney?: [number, number];
	/** which sides get windows (front always has the door in its middle module) */
	windows?: { front?: boolean; back?: boolean; sides?: boolean };
	vines?: boolean;
	/** window boxes with flowers (nature kit) under front windows */
	flowerBoxes?: boolean;
	/** keep the door open (no door leaf), for a hall people walk into */
	openDoor?: boolean;
}

export interface House {
	group: Group;
	/** every window's own glass: glows with the building's lights */
	glass: MeshStandardMaterial[];
	/** where each window is, in building space (for lights and glows) */
	windowSpots: { x: number; y: number; z: number; side: 'front' | 'back' | 'left' | 'right' }[];
	/** roof, gable ends and the front wall: the town hall fades these */
	fading: Object3D[];
	height: number;
	/** the light by the door */
	doorLamp: { intensity: number };
	doorLampGlow: MeshStandardMaterial;
}

function withOwnGlass(piece: Object3D, glass: MeshStandardMaterial[], kit: Kit) {
	piece.traverse((node) => {
		const mesh = node as Mesh;
		if (!mesh.isMesh) return;
		const swap = (material: Material) => {
			if (!material.name.includes('Glass')) return material;
			const own = kit.d.track((material as MeshStandardMaterial).clone());
			own.emissive.set(0xffb45c);
			own.emissiveIntensity = 0;
			own.opacity = 0.85;
			glass.push(own);
			return own;
		};
		mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
	});
	return piece;
}

export function buildHouse(village: KitSet, nature: KitSet, kit: Kit, spec: HouseSpec): House {
	const group = new Group();
	const glass: MeshStandardMaterial[] = [];
	const windowSpots: House['windowSpots'] = [];
	const fading: Object3D[] = [];
	const storeys = spec.storeys ?? 1;
	const height = storeys * STOREY;
	const walls = spec.style === 'brick' ? 'UnevenBrick' : 'Plaster';
	const windows = { front: true, back: true, sides: true, ...spec.windows };

	type Side = 'front' | 'back' | 'left' | 'right';
	const sides: {
		side: Side;
		length: number;
		along: (t: number) => [number, number];
		rotation: number;
	}[] = [
		{ side: 'front', length: spec.w, along: (t) => [t, spec.d / 2 - FACE], rotation: 0 },
		{ side: 'back', length: spec.w, along: (t) => [-t, -spec.d / 2 + FACE], rotation: Math.PI },
		{ side: 'right', length: spec.d, along: (t) => [spec.w / 2 - FACE, -t], rotation: Math.PI / 2 },
		{ side: 'left', length: spec.d, along: (t) => [-spec.w / 2 + FACE, t], rotation: -Math.PI / 2 }
	];

	for (let storey = 0; storey < storeys; storey++) {
		const y = storey * STOREY;
		for (const { side, length, along, rotation } of sides) {
			const modules = Math.round(length / 2);
			for (let i = 0; i < modules; i++) {
				const t = -length / 2 + 1 + i * 2;
				const [x, z] = along(t);
				const door = storey === 0 && side === 'front' && i === Math.floor(modules / 2);
				const wantsWindow =
					(side === 'front' && windows.front) ||
					(side === 'back' && windows.back) ||
					((side === 'left' || side === 'right') && windows.sides);
				// windows on every other module, never on the corners of long walls only
				const window =
					!door &&
					wantsWindow &&
					(modules <= 2 || i % 2 === (modules % 2 === 0 ? 1 : 0) || storey > 0);
				let piece: string;
				if (door) piece = `Wall_${walls}_Door_Round`;
				else if (window) piece = `Wall_${walls}_Window_Wide_Round`;
				else
					piece =
						storey === 0 && walls === 'Plaster'
							? 'Wall_Plaster_Straight_Base'
							: `Wall_${walls}_Straight`;
				const wall = village.clone(piece, x, y, z, rotation);
				group.add(wall);
				if (side === 'front') fading.push(wall);
				if (door) {
					const frame = village.clone('DoorFrame_Round_WoodDark', x, y, z, rotation);
					group.add(frame);
					if (side === 'front') fading.push(frame);
					if (!spec.openDoor) {
						// the leaf hinges at its left edge
						const leaf = village.clone('Door_1_Round', 0, y, 0, rotation);
						leaf.position.set(x - Math.cos(rotation) * 0.53, y, z + Math.sin(rotation) * 0.53);
						group.add(leaf);
						fading.push(leaf);
					}
				}
				if (window) {
					const glazing = withOwnGlass(
						village.clone('Window_Wide_Round1', x, y, z, rotation),
						glass,
						kit
					);
					group.add(glazing);
					if (side === 'front') fading.push(glazing);
					windowSpots.push({ x, y: y + 1.9, z, side });
					if (storey === 0 && side === 'front' && spec.flowerBoxes) {
						const out = 0.35;
						const bx = x + Math.sin(rotation) * out;
						const bz = z + Math.cos(rotation) * out;
						const box = kit.box(1.2, 0.22, 0.3, kit.mat(0x6b4426), 0, 0, 0);
						box.position.set(bx, y + 0.95, bz);
						box.rotation.y = rotation;
						group.add(box);
						const flowers = nature.clone('Flower_3_Group', bx, y + 1.05, bz, rotation, 0.45);
						group.add(flowers);
						fading.push(box, flowers);
					}
				}
			}
		}
		// corner posts
		for (const [x, z] of [
			[-spec.w / 2, -spec.d / 2],
			[spec.w / 2, -spec.d / 2],
			[-spec.w / 2, spec.d / 2],
			[spec.w / 2, spec.d / 2]
		]) {
			const corner = village.clone(
				walls === 'UnevenBrick' ? 'Corner_Exterior_Brick' : 'Corner_Exterior_Wood',
				x,
				y,
				z
			);
			group.add(corner);
		}
	}

	// the roof and its gable ends
	if (spec.roof) {
		const roof = village.clone(spec.roof, 0, height, 0);
		group.add(roof);
		fading.push(roof);
	}
	if (spec.gable) {
		const front = village.clone(spec.gable, 0, height, spec.d / 2 - FACE);
		const back = village.clone(spec.gable, 0, height, -spec.d / 2 + FACE, Math.PI);
		group.add(front, back);
		fading.push(front, back);
	}
	if (spec.chimney) {
		const chimney = village.clone('Prop_Chimney', spec.chimney[0], height + 0.4, spec.chimney[1]);
		group.add(chimney);
		fading.push(chimney);
	}
	if (spec.vines) {
		const vine = village.clone('Prop_Vine2', -spec.w / 2 + 0.9, height - 0.1, spec.d / 2 + 0.05);
		const vine2 = village.clone(
			'Prop_Vine4',
			spec.w / 2 + 0.05,
			height - 0.1,
			spec.d / 2 - 1.2,
			Math.PI / 2
		);
		group.add(vine, vine2);
		fading.push(vine);
	}

	// a lamp by the door
	const glowMat = kit.mat(0xfff1c1, { emissive: 0xffb45c, emissiveIntensity: 0 });
	const lantern = kit.box(0.22, 0.32, 0.22, glowMat, 0, 0, 0);
	lantern.position.set(0.95, 2.35, spec.d / 2 + 0.25);
	group.add(lantern);
	group.add(kit.box(0.06, 0.06, 0.3, kit.mat(0x2f3338), 0.95, 2.62, spec.d / 2 + 0.12));
	// a glow only: the lantern's emissive and the bloom light the door
	const doorLamp = glowOnly(0xffb45c);

	return { group, glass, windowSpots, fading, height, doorLamp, doorLampGlow: glowMat };
}

/** the house's pieces merged into a few meshes: call after makeFader, if any */
export function finishHouse(house: House, kit: Kit) {
	mergeStatic(house.group, kit);
}

/**
 * Gives each faded object its own transparent materials (once), and sets
 * their opacity; at full opacity they draw as opaque again.
 */
export function makeFader(objects: Object3D[], kit: Kit) {
	const materials: MeshStandardMaterial[] = [];
	const own = new Map<Material, MeshStandardMaterial>();
	for (const object of objects)
		object.traverse((node) => {
			const mesh = node as Mesh;
			if (!mesh.isMesh) return;
			const swap = (material: Material) => {
				let copy = own.get(material);
				if (!copy) {
					copy = kit.d.track((material as MeshStandardMaterial).clone());
					own.set(material, copy);
					materials.push(copy);
				}
				return copy;
			};
			mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
		});
	let last = 1;
	let wasSolid = true;
	return (opacity: number) => {
		if (Math.abs(opacity - last) < 0.005) return;
		last = opacity;
		const solid = opacity > 0.98;
		for (const material of materials) {
			material.opacity = solid ? (material.name.includes('Glass') ? 0.85 : 1) : opacity;
			if (solid !== wasSolid) {
				// switching between opaque and see-through changes the shader: only then
				material.transparent = !solid || material.name.includes('Glass');
				material.depthWrite = solid;
				material.needsUpdate = true;
			}
		}
		wasSolid = solid;
		// on the materials, so it still works after the meshes are merged
		for (const material of materials) material.visible = opacity > 0.03;
	};
}

/**
 * Merges every mesh under `root` (except those in `keep`, and anything
 * under a kept object) into one mesh per material, so a building costs a
 * handful of draw calls instead of hundreds. Transforms are baked in
 * relative to `root`; the merged meshes replace the originals.
 */
export function mergeStatic(root: Object3D, kit: Kit, keep: Set<Object3D> = new Set()) {
	root.updateMatrixWorld(true);
	const inverse = new Matrix4().copy(root.matrixWorld).invert();
	const byMaterial = new Map<
		string,
		{ material: Material; geometries: BufferGeometry[]; pick: unknown }
	>();
	const remove: Object3D[] = [];
	const kept = (node: Object3D) => {
		for (let n: Object3D | null = node; n && n !== root; n = n.parent) if (keep.has(n)) return true;
		return false;
	};
	root.traverse((node) => {
		const mesh = node as Mesh;
		if (!mesh.isMesh || (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
		if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || kept(mesh)) return;
		if (Array.isArray(mesh.material) || mesh.userData.pick?.kind === 'camera') return;
		// vertex-coloured pieces (the nature kit's bushes) keep their own mesh: merging drops colours
		if (mesh.geometry.attributes.color) return;
		const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
		geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
		for (const name of Object.keys(geometry.attributes))
			if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
		if (!geometry.attributes.uv || !geometry.attributes.normal) {
			geometry.dispose();
			return;
		}
		// what a click on it selects stays with it
		const pick = mesh.userData.pick;
		const key = `${mesh.material.uuid}|${JSON.stringify(pick ?? null)}`;
		const entry = byMaterial.get(key) ?? {
			material: mesh.material,
			geometries: [] as BufferGeometry[],
			pick
		};
		entry.geometries.push(geometry);
		byMaterial.set(key, entry);
		remove.push(mesh);
	});
	for (const mesh of remove) mesh.removeFromParent();
	const merged: Mesh[] = [];
	for (const { material, geometries, pick } of byMaterial.values()) {
		const geometry = mergeGeometries(geometries, false);
		for (const g of geometries) g.dispose();
		if (!geometry) continue;
		const mesh = new Mesh(kit.d.track(geometry), material);
		if (pick) mesh.userData.pick = pick;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		root.add(mesh);
		merged.push(mesh);
	}
	return merged;
}
