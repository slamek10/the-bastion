/**
 * The five villagers: Quaternius' CC0 base bodies (static/models, see
 * CREDITS.md) cloned per agent with SkeletonUtils, dressed in code. The
 * body texture keeps the skin; a small shader colours the rest by skeleton
 * region (shirt, trousers, shoes), so each agent gets its own outfit, and
 * accessories hang on bones (tie, hood, cap, apron, binoculars, badge).
 * One AnimationMixer each, with the clips of the animation library.
 * Everything made here is tracked in the caller's Disposer.
 */
import {
	AnimationClip,
	BoxGeometry,
	type BufferGeometry,
	AnimationMixer,
	Bone,
	Box3,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	PerspectiveCamera,
	Scene,
	Skeleton,
	SkinnedMesh,
	SphereGeometry,
	SRGBColorSpace,
	TextureLoader,
	TorusGeometry,
	Vector3,
	WebGLRenderTarget,
	AmbientLight,
	DirectionalLight,
	type AnimationAction,
	type Texture,
	type WebGLRenderer
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLIP_NAMES, type Clip } from '$lib/village/animation';
import type { Disposer } from '../disposer';
import type { AgentId } from '$lib/types';

type Accessory = 'tie' | 'hood' | 'cap' | 'apron' | 'binoculars' | 'scarf';

export interface Look {
	body: 'male' | 'female';
	skin: 'dark' | 'light';
	/** tints the skin texture a little, for more variety */
	skinTint: number;
	/** hairstyle node names in hair.glb */
	hair: string[];
	hairColor: number;
	shirt: number;
	trousers: number;
	shoes: number;
	/** the agent's colour: the badge on its chest */
	accent: number;
	accessories: Accessory[];
	height: number;
}

export const LOOKS: Record<AgentId, Look> = {
	orchestrator: {
		body: 'male',
		skin: 'light',
		skinTint: 0xfff4ea,
		hair: ['Hair_SimpleParted'],
		hairColor: 0x6b4a32,
		shirt: 0x26365a,
		trousers: 0x1d2536,
		shoes: 0x1b1b1f,
		accent: 0xa78bfa,
		accessories: ['tie'],
		height: 1.8
	},
	watchdog: {
		body: 'male',
		skin: 'dark',
		skinTint: 0xffffff,
		hair: ['Hair_Buzzed', 'Hair_Beard'],
		hairColor: 0x2a211b,
		shirt: 0x3d4a3a,
		trousers: 0x34506e,
		shoes: 0xe8e4dc,
		accent: 0xf59e0b,
		accessories: ['hood'],
		height: 1.78
	},
	thermal: {
		body: 'male',
		skin: 'light',
		skinTint: 0xffe2cc,
		hair: ['Hair_Buzzed'],
		hairColor: 0xb3622c,
		shirt: 0xd9692a,
		trousers: 0xc75a20,
		shoes: 0x5a3b22,
		accent: 0xf97316,
		accessories: ['cap'],
		height: 1.74
	},
	homekeeper: {
		body: 'female',
		skin: 'dark',
		skinTint: 0xffffff,
		hair: ['Hair_Buns'],
		hairColor: 0x221a16,
		shirt: 0x2f8f8a,
		trousers: 0x5b4636,
		shoes: 0x3a2a20,
		accent: 0x22d3ee,
		accessories: ['apron'],
		height: 1.66
	},
	vision: {
		body: 'female',
		skin: 'light',
		skinTint: 0xfff0e6,
		hair: ['Hair_Long'],
		hairColor: 0xd9b26a,
		shirt: 0x5d6b3a,
		trousers: 0x2d3a4a,
		shoes: 0x3b2a1e,
		accent: 0xef4444,
		accessories: ['binoculars', 'scarf'],
		height: 1.7
	}
};

export interface CharacterAssets {
	bodies: Record<Look['body'], GLTF>;
	hair: GLTF;
	clips: AnimationClip[];
	lightSkin: Record<Look['body'], Texture>;
}

const BASE = '/models';

/** loads the models once per 3D view; tracked for disposal */
export async function loadCharacterAssets(d: Disposer): Promise<CharacterAssets> {
	const loader = new GLTFLoader();
	const textures = new TextureLoader();
	const [male, female, hair, anims, maleSkin, femaleSkin] = await Promise.all([
		loader.loadAsync(`${BASE}/body_male.glb`),
		loader.loadAsync(`${BASE}/body_female.glb`),
		loader.loadAsync(`${BASE}/hair.glb`),
		loader.loadAsync(`${BASE}/anims.glb`),
		textures.loadAsync(`${BASE}/skin_male_light.jpg`),
		textures.loadAsync(`${BASE}/skin_female_light.jpg`)
	]);
	for (const gltf of [male, female, hair, anims]) d.trackTree(gltf.scene);
	for (const texture of [maleSkin, femaleSkin]) {
		texture.colorSpace = SRGBColorSpace;
		// glTF textures aren't flipped
		texture.flipY = false;
		d.track(texture);
	}
	// in place: the clips may move the root, the village moves the agents
	const clips = anims.animations.map((clip) => {
		const copy = clip.clone();
		copy.tracks = copy.tracks.filter((track) => track.name !== 'root.position');
		return copy;
	});
	return {
		bodies: { male, female },
		hair,
		clips,
		lightSkin: { male: maleSkin, female: femaleSkin }
	};
}

/* ------------------------------------------------------------ outfits */

/** which part of the outfit a bone's vertices wear: 0 skin, 1 shirt, 2 trousers, 3 shoes */
export function boneRegion(name: string): number {
	if (/^(Head|neck|hand|index|middle|pinky|ring|thumb)/.test(name)) return 0;
	if (/^(foot|ball)/.test(name)) return 3;
	if (/^(pelvis|thigh|calf|root)/.test(name)) return 2;
	return 1;
}

function dress(material: MeshStandardMaterial, look: Look, bones: Bone[], skin?: Texture) {
	const dressed = material.clone();
	if (skin) dressed.map = skin;
	dressed.metalness = 0;
	dressed.roughness = 0.8;
	const regions = bones.map((bone) => boneRegion(bone.name));
	const uniforms = {
		boneRegion: { value: regions },
		uShirt: { value: new Color(look.shirt) },
		uTrousers: { value: new Color(look.trousers) },
		uShoes: { value: new Color(look.shoes) },
		uSkinTint: { value: new Color(look.skinTint) }
	};
	dressed.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				`#include <common>\nuniform float boneRegion[${regions.length}];\nflat varying float vRegion;`
			)
			.replace(
				'#include <skinbase_vertex>',
				`#include <skinbase_vertex>
				{
					float best = skinWeight.x;
					float region = boneRegion[int(skinIndex.x)];
					if (skinWeight.y > best) { best = skinWeight.y; region = boneRegion[int(skinIndex.y)]; }
					if (skinWeight.z > best) { best = skinWeight.z; region = boneRegion[int(skinIndex.z)]; }
					if (skinWeight.w > best) { best = skinWeight.w; region = boneRegion[int(skinIndex.w)]; }
					vRegion = region;
				}`
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>\nuniform vec3 uShirt;\nuniform vec3 uTrousers;\nuniform vec3 uShoes;\nuniform vec3 uSkinTint;\nflat varying float vRegion;`
			)
			.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
				if (vRegion > 0.5) {
					float shade = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
					vec3 cloth = vRegion < 1.5 ? uShirt : (vRegion < 2.5 ? uTrousers : uShoes);
					diffuseColor.rgb = cloth * (0.8 + 0.4 * shade);
				} else {
					diffuseColor.rgb *= uSkinTint;
				}`
			);
	};
	// one shader per outfit, not one per uniform set
	dressed.customProgramCacheKey = () => `bastion-outfit-${regions.length}`;
	return dressed;
}

/* ------------------------------------------------------------ characters */

export interface Character {
	root: Group;
	mixer: AnimationMixer;
	actions: Partial<Record<Clip, AnimationAction>>;
	head: Object3D;
	look: Look;
}

/** a world point a little in front of a bone, at rest pose */
function near(bone: Object3D, forward: number, up = 0) {
	const point = new Vector3();
	bone.getWorldPosition(point);
	return point.add(new Vector3(0, up, forward));
}

function accessory(kit: AccessoryKit, look: Look, bones: Map<string, Bone>, which: Accessory) {
	const chest = bones.get('spine_03')!;
	const head = bones.get('Head')!;
	const pelvis = bones.get('pelvis')!;
	const accent = kit.mat(look.accent);
	const mesh = new Group();
	let bone: Object3D = chest;
	switch (which) {
		case 'tie': {
			const tie = new Mesh(kit.box(0.06, 0.32, 0.02), accent);
			tie.position.copy(near(chest, 0.14, -0.08));
			mesh.add(tie);
			break;
		}
		case 'hood': {
			const hood = new Mesh(
				kit.geo(new TorusGeometry(0.12, 0.05, 8, 16, Math.PI)),
				kit.mat(look.shirt)
			);
			hood.position.copy(near(chest, -0.1, 0.18));
			hood.rotation.x = Math.PI / 2;
			mesh.add(hood);
			break;
		}
		case 'cap': {
			bone = head;
			const top = near(head, 0, 0.13);
			const crown = new Mesh(
				kit.geo(new SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
				accent
			);
			crown.position.copy(top);
			const brim = new Mesh(kit.geo(new CylinderGeometry(0.1, 0.1, 0.015, 16)), accent);
			brim.position.copy(top).add(new Vector3(0, 0.005, 0.1));
			brim.scale.set(1, 1, 0.8);
			mesh.add(crown, brim);
			break;
		}
		case 'apron': {
			bone = pelvis;
			const apron = new Mesh(kit.box(0.34, 0.55, 0.02), kit.mat(0xf3ead8));
			apron.position.copy(near(pelvis, 0.15, -0.12));
			const strap = new Mesh(kit.box(0.36, 0.03, 0.02), accent);
			strap.position.copy(near(pelvis, 0.15, 0.13));
			mesh.add(apron, strap);
			break;
		}
		case 'binoculars': {
			const dark = kit.mat(0x22262b);
			for (const x of [-0.045, 0.045]) {
				const tube = new Mesh(kit.geo(new CylinderGeometry(0.03, 0.035, 0.12, 10)), dark);
				tube.position.copy(near(chest, 0.16, -0.1)).add(new Vector3(x, 0, 0));
				tube.rotation.x = Math.PI / 2;
				mesh.add(tube);
			}
			break;
		}
		case 'scarf': {
			const scarf = new Mesh(kit.geo(new TorusGeometry(0.09, 0.035, 8, 20)), accent);
			scarf.position.copy(near(chest, 0.01, 0.2));
			scarf.rotation.x = Math.PI / 2;
			mesh.add(scarf);
			break;
		}
	}
	return { mesh, bone };
}

interface AccessoryKit {
	mat: (color: number) => MeshStandardMaterial;
	box: (w: number, h: number, d: number) => BufferGeometry;
	geo: <T extends BufferGeometry>(g: T) => T;
}

export function createCharacter(assets: CharacterAssets, id: AgentId, d: Disposer): Character {
	const look = LOOKS[id];
	const model = cloneSkinned(assets.bodies[look.body].scene) as Group;
	const bones = new Map<string, Bone>();
	model.traverse((child) => {
		if ((child as Bone).isBone) bones.set(child.name, child as Bone);
	});
	model.traverse((child) => {
		const mesh = child as SkinnedMesh;
		if (!mesh.isSkinnedMesh) return;
		mesh.castShadow = true;
		mesh.frustumCulled = false;
		const material = mesh.material as MeshStandardMaterial;
		if (/Superhero/.test(material.name)) {
			mesh.material = d.track(
				dress(
					material,
					look,
					mesh.skeleton.bones,
					look.skin === 'light' ? assets.lightSkin[look.body] : undefined
				)
			);
		} else if (/Hair/.test(material.name)) {
			// eyebrows: the hair colour
			const tinted = d.track(material.clone());
			tinted.color.set(look.hairColor).multiplyScalar(1.6);
			mesh.material = tinted;
		}
	});

	// hair: the chosen styles, bound to this body's bones by name
	for (const name of look.hair) {
		const source = assets.hair.scene.getObjectByName(name);
		const sourceMesh = (source as SkinnedMesh)?.isSkinnedMesh
			? (source as SkinnedMesh)
			: (source?.children.find((c) => (c as SkinnedMesh).isSkinnedMesh) as SkinnedMesh | undefined);
		if (!sourceMesh) continue;
		const material = d.track((sourceMesh.material as MeshStandardMaterial).clone());
		material.color.set(look.hairColor).multiplyScalar(1.8);
		material.metalness = 0;
		material.roughness = 0.7;
		const hair = new SkinnedMesh(sourceMesh.geometry, material);
		const hairBones = sourceMesh.skeleton.bones.map((bone) => bones.get(bone.name) ?? bone);
		const hairSkeleton = d.track(new Skeleton(hairBones, sourceMesh.skeleton.boneInverses));
		hair.bind(hairSkeleton, sourceMesh.bindMatrix);
		hair.castShadow = true;
		hair.frustumCulled = false;
		model.add(hair);
	}

	// size: each look its own height
	model.updateMatrixWorld(true);
	const box = new Box3().setFromObject(model);
	const scale = look.height / Math.max(0.5, box.max.y - box.min.y);

	// accessories, placed at rest pose and carried by their bone
	const kit: AccessoryKit = {
		mat: (color) => d.track(new MeshStandardMaterial({ color, roughness: 0.6 })),
		box: (w, h, depth) => d.track(new BoxGeometry(w, h, depth)),
		geo: (g) => d.track(g)
	};
	for (const which of look.accessories) {
		const { mesh, bone } = accessory(kit, look, bones, which);
		for (const child of [...mesh.children]) {
			child.castShadow = true;
			model.add(child);
			bone.attach(child);
		}
	}
	// the badge in the agent's colour, on the left chest
	const badge = new Mesh(
		d.track(new CylinderGeometry(0.035, 0.035, 0.01, 16)),
		d.track(
			new MeshStandardMaterial({
				color: look.accent,
				emissive: look.accent,
				emissiveIntensity: 0.6
			})
		)
	);
	badge.rotation.x = Math.PI / 2;
	badge.position.copy(near(bones.get('spine_03')!, 0.15, 0.02)).add(new Vector3(0.09, 0, 0));
	model.add(badge);
	bones.get('spine_03')!.attach(badge);

	const root = new Group();
	root.name = `character-${id}`;
	model.scale.setScalar(scale);
	root.add(model);

	const mixer = d.trackMixer(new AnimationMixer(model), model);
	const actions: Partial<Record<Clip, AnimationAction>> = {};
	for (const [clip, name] of Object.entries(CLIP_NAMES) as [Clip, string][]) {
		const source = assets.clips.find((c) => c.name === name);
		if (source) actions[clip] = mixer.clipAction(source);
	}
	return { root, mixer, actions, head: bones.get('Head')!, look };
}

/* ------------------------------------------------------------ portraits */

const portraitCache = new Map<AgentId, string>();

/**
 * The character's head and shoulders, rendered once into a small offscreen
 * target and kept as a data URL for the HUD. The target is disposed at once.
 */
export function renderPortrait(
	renderer: WebGLRenderer,
	id: AgentId,
	character: Character,
	size = 128
) {
	const cached = portraitCache.get(id);
	if (cached) return cached;
	const scene = new Scene();
	scene.add(new AmbientLight(0xffffff, 1.2));
	const key = new DirectionalLight(0xffffff, 2.2);
	key.position.set(1, 2, 3);
	scene.add(key);
	const parent = character.root.parent;
	const saved = { position: character.root.position.clone(), rotation: character.root.rotation.y };
	character.root.position.set(0, 0, 0);
	character.root.rotation.y = 0;
	scene.add(character.root);
	character.actions.idle?.play();
	character.mixer.update(0.5);
	scene.updateMatrixWorld(true);
	const head = new Vector3();
	character.head.getWorldPosition(head);
	const camera = new PerspectiveCamera(30, 1, 0.05, 10);
	camera.position.set(head.x, head.y + 0.02, head.z + 0.85);
	camera.lookAt(head.x, head.y - 0.04, head.z);
	const target = new WebGLRenderTarget(size, size);
	renderer.setRenderTarget(target);
	renderer.setClearColor(0x000000, 0);
	renderer.clear();
	renderer.render(scene, camera);
	const pixels = new Uint8Array(size * size * 4);
	renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
	renderer.setRenderTarget(null);
	target.dispose();
	key.dispose();
	// back where it was
	scene.remove(character.root);
	parent?.add(character.root);
	character.root.position.copy(saved.position);
	character.root.rotation.y = saved.rotation;

	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const image = ctx.createImageData(size, size);
	// WebGL rows run bottom up
	for (let y = 0; y < size; y++)
		image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
	ctx.putImageData(image, 0, 0);
	const url = canvas.toDataURL('image/png');
	portraitCache.set(id, url);
	return url;
}
