import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '$lib/server/config';
import { cleanBindings } from '$lib/bindings';
import type { Bindings } from '$lib/types';

const file = () => join(config.dataDir, 'bindings.json');

export async function loadBindings(): Promise<Bindings> {
	try {
		return cleanBindings(JSON.parse(await readFile(file(), 'utf8')));
	} catch {
		return cleanBindings({});
	}
}

export async function saveBindings(value: unknown) {
	const bindings = cleanBindings(value);
	await mkdir(config.dataDir, { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(bindings, null, '\t') + '\n');
	await rename(tmp, file());
	return bindings;
}
