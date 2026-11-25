/**
 * Builds the village's building and nature pieces from Quaternius' free CC0
 * kits (see static/models/CREDITS.md):
 *   node scripts/build-kits.mjs "<folder with both unzipped kits>"
 *
 * - village_kit.glb: the Medieval Village MegaKit pieces the buildings use
 *   (walls, windows, doors, roofs, chimneys, vines, fences, props), one
 *   named node per piece; base colours 1024 px JPEG, normal maps 512 px,
 *   roughness / ORM maps dropped
 * - nature_kit.glb: the Stylized Nature MegaKit pieces (trees, bushes,
 *   flowers, grass, rocks, path stones); leaf and flower textures keep their
 *   alpha as 512 px PNG, normal maps dropped
 *
 * Needs macOS `sips`. The output is committed; run this only to rebuild it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, mergeDocuments, prune, unpartition, weld } from '@gltf-transform/functions';

const source = resolve(process.argv[2] ?? '');
const out = resolve('static/models');
const tmp = mkdtempSync(join(tmpdir(), 'bastion-kits-'));
mkdirSync(out, { recursive: true });

const VILLAGE = join(source, 'Medieval Village MegaKit[Standard]', 'glTF');
const NATURE = join(source, 'glTF');

export const VILLAGE_PIECES = [
	'Wall_Plaster_Straight',
	'Wall_Plaster_Straight_Base',
	'Wall_Plaster_Window_Wide_Round',
	'Wall_Plaster_Window_Thin_Round',
	'Wall_Plaster_Door_Round',
	'Wall_Plaster_WoodGrid',
	'Wall_UnevenBrick_Straight',
	'Wall_UnevenBrick_Window_Wide_Round',
	'Wall_UnevenBrick_Window_Thin_Round',
	'Wall_UnevenBrick_Door_Round',
	'Wall_BottomCover',
	'Corner_Exterior_Wood',
	'Corner_Exterior_Brick',
	'Door_1_Round',
	'DoorFrame_Round_WoodDark',
	'DoorFrame_Round_Brick',
	'Window_Wide_Round1',
	'Window_Thin_Round1',
	'WindowShutters_Wide_Round_Open',
	'WindowShutters_Thin_Round_Open',
	'Roof_RoundTiles_6x6',
	'Roof_RoundTiles_6x8',
	'Roof_RoundTiles_8x8',
	'Roof_RoundTiles_8x12',
	'Roof_Tower_RoundTiles',
	'Roof_Front_Brick6',
	'Roof_Front_Brick8',
	'Roof_Dormer_RoundTile',
	'Prop_Chimney',
	'Prop_Chimney2',
	'Prop_Crate',
	'Prop_Wagon',
	'Prop_WoodenFence_Single',
	'Prop_WoodenFence_Extension1',
	'Prop_Vine1',
	'Prop_Vine2',
	'Prop_Vine4',
	'Prop_Support',
	'Prop_ExteriorBorder_Straight1',
	'Prop_ExteriorBorder_Corner',
	'Prop_MetalFence_Simple',
	'Stairs_Exterior_Straight',
	'Floor_UnevenBrick',
	'Floor_WoodDark'
];

export const NATURE_PIECES = [
	'CommonTree_1',
	'CommonTree_2',
	'CommonTree_3',
	'CommonTree_4',
	'Pine_1',
	'Pine_2',
	'Pine_3',
	'TwistedTree_1',
	'Bush_Common',
	'Bush_Common_Flowers',
	'Flower_3_Group',
	'Flower_4_Group',
	'Grass_Common_Short',
	'Grass_Wispy_Tall',
	'Fern_1',
	'Plant_1',
	'Plant_7',
	'Clover_1',
	'Mushroom_Common',
	'Rock_Medium_1',
	'Rock_Medium_2',
	'Rock_Medium_3',
	'Pebble_Round_1',
	'Pebble_Round_2',
	'Pebble_Square_1',
	'Pebble_Square_2',
	'Pebble_Square_3',
	'RockPath_Round_Small_1',
	'RockPath_Round_Small_2',
	'RockPath_Round_Wide'
];

const io = new NodeIO();

/** a .gltf whose images may name files the kit has without "_png" */
async function readGltf(file) {
	const json = JSON.parse(readFileSync(file, 'utf8'));
	const dir = file.slice(0, file.lastIndexOf('/'));
	for (const image of json.images ?? []) {
		if (!image.uri || existsSync(join(dir, decodeURIComponent(image.uri)))) continue;
		const fallback = decodeURIComponent(image.uri).replace(/_png\.png$/, '.png');
		if (existsSync(join(dir, fallback))) image.uri = encodeURIComponent(fallback);
		else delete image.uri;
	}
	const patched = join(dir, `.patched-${file.split('/').pop()}`);
	writeFileSync(patched, JSON.stringify(json));
	try {
		return await io.read(patched);
	} finally {
		rmSync(patched);
	}
}

/** every piece under one node named after its file, all in one document */
async function pack(dir, names) {
	let master;
	for (const name of names) {
		const doc = await readGltf(join(dir, `${name}.gltf`));
		const scene = doc.getRoot().listScenes()[0];
		const wrapper = doc.createNode(name);
		for (const child of scene.listChildren()) wrapper.addChild(child);
		scene.addChild(wrapper);
		if (!master) master = doc;
		else {
			mergeDocuments(master, doc);
		}
	}
	const [scene, ...others] = master.getRoot().listScenes();
	for (const other of others) {
		for (const child of other.listChildren()) scene.addChild(child);
		other.dispose();
	}
	return master;
}

let n = 0;
function resize(buffer, size, format) {
	const input = join(tmp, `in-${n}.png`);
	const output = join(tmp, `out-${n++}.${format === 'jpeg' ? 'jpg' : 'png'}`);
	writeFileSync(input, buffer);
	const args = ['-Z', String(size), input, '--out', output];
	if (format === 'jpeg') args.unshift('-s', 'format', 'jpeg', '-s', 'formatOptions', '80');
	else args.unshift('-s', 'format', 'png');
	execFileSync('sips', args, { stdio: 'ignore' });
	return readFileSync(output);
}

/** textures by use: colour (JPEG, or PNG when the material cuts out), normals (kept or dropped), the rest dropped */
async function slim(document, { color, normal }) {
	const root = document.getRoot();
	const uses = new Map();
	for (const material of root.listMaterials()) {
		material.setMetallicRoughnessTexture(null);
		material.setOcclusionTexture(null);
		material.setMetallicFactor(0);
		if (!material.getName().includes('Glass')) material.setRoughnessFactor(0.85);
		if (!normal) material.setNormalTexture(null);
		const base = material.getBaseColorTexture();
		if (base) uses.set(base, material.getAlphaMode() === 'OPAQUE' ? 'jpeg-color' : 'png-color');
		const normalTexture = material.getNormalTexture();
		if (normalTexture) uses.set(normalTexture, 'normal');
	}
	for (const texture of root.listTextures()) {
		const use = uses.get(texture);
		if (!use) {
			texture.dispose();
			continue;
		}
		if (use === 'normal')
			texture.setImage(resize(texture.getImage(), normal, 'jpeg')).setMimeType('image/jpeg');
		else if (use === 'jpeg-color')
			texture.setImage(resize(texture.getImage(), color, 'jpeg')).setMimeType('image/jpeg');
		else texture.setImage(resize(texture.getImage(), 512, 'png')).setMimeType('image/png');
		texture.setURI('');
	}
	await document.transform(dedup(), weld(), prune(), unpartition());
	return document;
}

const village = await pack(VILLAGE, VILLAGE_PIECES);
await slim(village, { color: 1024, normal: 512 });
await io.write(join(out, 'village_kit.glb'), village);

const nature = await pack(NATURE, NATURE_PIECES);
await slim(nature, { color: 512, normal: 0 });
await io.write(join(out, 'nature_kit.glb'), nature);

rmSync(tmp, { recursive: true, force: true });
console.log('kits written to', out);
