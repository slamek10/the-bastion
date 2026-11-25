/**
 * Builds static/models/ from Quaternius' free CC0 packs (see static/models/CREDITS.md):
 *   node scripts/build-models.mjs "<folder with both unzipped packs>"
 *
 * - body_male.glb, body_female.glb: the two base bodies, normal and
 *   roughness maps dropped, the base colour at 1024 px JPEG
 * - skin_male_light.jpg, skin_female_light.jpg: the lighter skin, swapped in per character
 * - hair.glb: six hairstyles rigged to the same skeleton
 * - anims.glb: the few clips the village uses, without the mannequin mesh
 *
 * Needs macOS `sips` for the resizing. The output is committed; run this
 * only to rebuild it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, resample, unpartition } from '@gltf-transform/functions';

const source = resolve(process.argv[2] ?? '');
const out = resolve('static/models');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'bastion-models-'));

const BASE = join(source, 'Universal Base Characters[Standard]', 'Base Characters');
const HAIR = join(
	source,
	'Universal Base Characters[Standard]',
	'Hairstyles',
	'Rigged to Head Bone',
	'glTF (Godot -Unreal)'
);
const ANIM = join(
	source,
	'Universal Animation Library[Standard]',
	'Unreal-Godot',
	'UAL1_Standard.glb'
);

/** a PNG as a JPEG of at most `size` px */
function jpeg(
	file,
	size,
	name = file
		.split('/')
		.pop()
		.replace(/\.png$/, '.jpg'),
	dir = tmp
) {
	const target = join(dir, name);
	execFileSync(
		'sips',
		[
			'-s',
			'format',
			'jpeg',
			'-s',
			'formatOptions',
			'80',
			'-Z',
			String(size),
			file,
			'--out',
			target
		],
		{
			stdio: 'ignore'
		}
	);
	return target;
}

const io = new NodeIO();

/**
 * Reads a .gltf whose images may name files the pack doesn't have
 * (T_Eye_Normal_png.png next to T_Eye_Normal.png): those point at the file
 * without the _png, or are dropped (only normal maps are missing, and they go anyway).
 */
async function readGltf(file) {
	const json = JSON.parse(readFileSync(file, 'utf8'));
	const dir = file.slice(0, file.lastIndexOf('/'));
	for (const image of json.images ?? []) {
		if (!image.uri || existsSync(join(dir, decodeURIComponent(image.uri)))) continue;
		const fallback = decodeURIComponent(image.uri).replace(/_png\.png$/, '.png');
		image.uri = existsSync(join(dir, fallback)) ? encodeURIComponent(fallback) : undefined;
		if (!image.uri) delete image.uri;
	}
	const patched = join(dir, `.patched-${file.split('/').pop()}`);
	writeFileSync(patched, JSON.stringify(json));
	try {
		return await io.read(patched);
	} finally {
		rmSync(patched);
	}
}

/** drops normal / roughness / occlusion maps and shrinks every base colour */
async function slim(document, size) {
	for (const material of document.getRoot().listMaterials()) {
		material.setNormalTexture(null);
		material.setMetallicRoughnessTexture(null);
		material.setOcclusionTexture(null);
		material.setMetallicFactor(0);
		material.setRoughnessFactor(0.75);
	}
	for (const texture of document.getRoot().listTextures()) {
		const used = document
			.getRoot()
			.listMaterials()
			.some((material) => material.getBaseColorTexture() === texture);
		if (!used) {
			texture.dispose();
			continue;
		}
		const png = join(tmp, `${Math.random().toString(36).slice(2)}.png`);
		writeFileSync(png, texture.getImage());
		texture
			.setImage(readFileSync(jpeg(png, size)))
			.setMimeType('image/jpeg')
			.setURI('');
	}
	await document.transform(prune(), dedup(), unpartition());
	return document;
}

// bodies
for (const body of ['Male', 'Female']) {
	const document = await readGltf(join(BASE, 'Godot - UE', `Superhero_${body}_FullBody.gltf`));
	await slim(document, 1024);
	await io.write(join(out, `body_${body.toLowerCase()}.glb`), document);
}
jpeg(join(BASE, 'Textures', 'T_Superhero_Male_Ligh.png'), 1024, 'skin_male_light.jpg', out);
jpeg(
	join(BASE, 'Textures', 'T_Superhero_Female_Light_BaseColor.png'),
	1024,
	'skin_female_light.jpg',
	out
);

// hair: one file, each style its own node
const HAIRSTYLES = [
	'Hair_SimpleParted',
	'Hair_Buzzed',
	'Hair_Beard',
	'Hair_Buns',
	'Hair_Long',
	'Hair_BuzzedFemale'
];
const hair = await readGltf(join(HAIR, `${HAIRSTYLES[0]}.gltf`));
for (const name of HAIRSTYLES.slice(1))
	mergeDocuments(hair, await readGltf(join(HAIR, `${name}.gltf`)));
// one scene with every style in it
const [scene, ...others] = hair.getRoot().listScenes();
for (const other of others) {
	for (const child of other.listChildren()) scene.addChild(child);
	other.dispose();
}
await slim(hair, 512);
await io.write(join(out, 'hair.glb'), hair);

// animations: only the clips the village uses, no mesh
const CLIPS = [
	'Idle_Loop',
	'Walk_Loop',
	'Jog_Fwd_Loop',
	'Sitting_Idle_Loop',
	'Sitting_Talking_Loop',
	'Idle_Talking_Loop',
	'Interact',
	'Fixing_Kneeling'
];
const anims = await io.read(ANIM);
for (const animation of anims.getRoot().listAnimations())
	if (!CLIPS.includes(animation.getName())) animation.dispose();
for (const node of anims.getRoot().listNodes()) {
	node.setMesh(null);
	node.setSkin(null);
}
for (const mesh of anims.getRoot().listMeshes()) mesh.dispose();
await anims.transform(
	resample({ tolerance: 1e-3 }),
	prune({ keepLeaves: true }),
	dedup(),
	unpartition()
);
await io.write(join(out, 'anims.glb'), anims);

rmSync(tmp, { recursive: true, force: true });
console.log('models written to', out);
