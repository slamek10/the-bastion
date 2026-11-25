/**
 * Keeps every GPU resource a scene builder makes (geometries, materials,
 * textures, render targets) so one dispose() frees them all; nothing is left
 * behind in renderer.info.memory when the 3D view closes.
 */
export interface Disposable {
	dispose: () => void;
}

interface MaybeMesh {
	geometry?: Disposable;
	material?: Disposable | Disposable[];
	/** a SkinnedMesh's skeleton (its bone texture) */
	skeleton?: Disposable;
	/** an InstancedMesh (its instance attributes) */
	isInstancedMesh?: boolean;
	dispose?: () => void;
	traverse?: (fn: (child: MaybeMesh) => void) => void;
}

/** what an AnimationMixer needs to let go of a model */
interface MixerLike {
	stopAllAction: () => unknown;
	uncacheRoot: (root: never) => void;
}

const TEXTURE_KEYS = [
	'map',
	'emissiveMap',
	'alphaMap',
	'normalMap',
	'roughnessMap',
	'metalnessMap',
	'aoMap',
	'envMap',
	'lightMap',
	'bumpMap'
];

export class Disposer {
	private items = new Set<Disposable>();

	get size() {
		return this.items.size;
	}

	/** tracks one resource and gives it back, so it can wrap a `new` */
	track<T extends Disposable>(item: T): T {
		this.items.add(item);
		return item;
	}

	/** tracks every geometry, material and material texture under an object */
	trackTree<T extends MaybeMesh>(root: T): T {
		const visit = (node: MaybeMesh) => {
			if (node.geometry) this.items.add(node.geometry);
			if (node.skeleton && typeof node.skeleton.dispose === 'function')
				this.items.add(node.skeleton);
			if (node.isInstancedMesh && typeof node.dispose === 'function')
				this.items.add({ dispose: () => node.dispose!() });
			const materials = node.material
				? Array.isArray(node.material)
					? node.material
					: [node.material]
				: [];
			for (const material of materials) {
				this.items.add(material);
				for (const key of TEXTURE_KEYS) {
					const texture = (material as unknown as Record<string, unknown>)[key] as
						Disposable | null | undefined;
					if (texture && typeof texture.dispose === 'function') this.items.add(texture);
				}
			}
		};
		if (root.traverse) root.traverse(visit);
		else visit(root);
		return root;
	}

	/** an animation mixer: its actions stopped and its cache for the model dropped */
	trackMixer<T extends MixerLike>(mixer: T, root: unknown): T {
		this.items.add({
			dispose: () => {
				mixer.stopAllAction();
				mixer.uncacheRoot(root as never);
			}
		});
		return mixer;
	}

	dispose() {
		for (const item of this.items) {
			try {
				item.dispose();
			} catch {
				// one failing doesn't keep the rest
			}
		}
		this.items.clear();
	}
}
