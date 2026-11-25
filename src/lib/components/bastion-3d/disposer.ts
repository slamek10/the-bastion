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
	traverse?: (fn: (child: MaybeMesh) => void) => void;
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
