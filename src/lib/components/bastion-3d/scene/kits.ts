/**
 * The building and nature kits (static/models/village_kit.glb,
 * nature_kit.glb; Quaternius, CC0): one named node per piece. Builders take
 * clones (sharing geometry and materials) or instanced copies.
 */
import {
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	Vector3,
	type Material
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Disposer } from '../disposer';

export class KitSet {
	private pieces = new Map<string, Object3D>();
	private materials = new Map<string, Material>();

	constructor(root: Object3D) {
		for (const child of root.children) this.pieces.set(child.name, child);
		root.traverse((node) => {
			const mesh = node as Mesh;
			if (!mesh.isMesh) return;
			const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			for (const material of list) {
				this.materials.set(material.name, material);
				// the kits are lit by the village, not by their own roughness maps
				const standard = material as MeshStandardMaterial;
				if (standard.isMeshStandardMaterial) standard.envMapIntensity = 0;
			}
		});
	}

	has(name: string) {
		return this.pieces.has(name);
	}

	material(name: string) {
		return this.materials.get(name);
	}

	/** a copy of a piece (geometry and materials shared), casting and taking shadows */
	clone(name: string, x = 0, y = 0, z = 0, rotation = 0, scale = 1) {
		const source = this.pieces.get(name);
		const piece = source ? source.clone(true) : new Group();
		piece.position.set(x, y, z);
		piece.rotation.y = rotation;
		piece.scale.setScalar(scale);
		piece.traverse((node) => {
			if ((node as Mesh).isMesh) {
				node.castShadow = true;
				node.receiveShadow = true;
			}
		});
		return piece;
	}

	/**
	 * Many copies of a piece in one draw call per mesh: one InstancedMesh for
	 * each mesh in the piece. `track` gets each InstancedMesh for disposal.
	 */
	instanced(
		name: string,
		placements: { x: number; y?: number; z: number; rotation?: number; scale?: number }[],
		track: (mesh: InstancedMesh) => void,
		shadows = true
	) {
		const group = new Group();
		group.name = `instances-${name}`;
		const source = this.pieces.get(name);
		if (!source || !placements.length) return group;
		source.updateMatrixWorld(true);
		const rootInverse = new Matrix4().copy(source.matrixWorld).invert();
		const each = new Matrix4();
		const local = new Matrix4();
		const q = new Quaternion();
		const up = new Vector3(0, 1, 0);
		source.traverse((node) => {
			const mesh = node as Mesh;
			if (!mesh.isMesh) return;
			local.multiplyMatrices(rootInverse, mesh.matrixWorld);
			const instances = new InstancedMesh(mesh.geometry, mesh.material, placements.length);
			placements.forEach((p, i) => {
				q.setFromAxisAngle(up, p.rotation ?? 0);
				const s = p.scale ?? 1;
				each.compose(new Vector3(p.x, p.y ?? 0, p.z), q, new Vector3(s, s, s)).multiply(local);
				instances.setMatrixAt(i, each);
			});
			instances.instanceMatrix.needsUpdate = true;
			instances.castShadow = shadows;
			instances.receiveShadow = true;
			instances.computeBoundingSphere();
			track(instances);
			group.add(instances);
		});
		return group;
	}
}

export interface Kits {
	village: KitSet;
	nature: KitSet;
}

/** loads both kits once per 3D view; tracked for disposal */
export async function loadKits(d: Disposer): Promise<Kits> {
	const loader = new GLTFLoader();
	const [village, nature] = await Promise.all([
		loader.loadAsync('/models/village_kit.glb'),
		loader.loadAsync('/models/nature_kit.glb')
	]);
	d.trackTree(village.scene);
	d.trackTree(nature.scene);
	return { village: new KitSet(village.scene), nature: new KitSet(nature.scene) };
}
