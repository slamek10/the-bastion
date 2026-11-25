/**
 * Screenshots and frame rates of the 3D village in demo mode, in headless
 * Chromium on the Mac's GPU (Metal):
 *   pnpm build && PORT=5040 node server.js &
 *   node scripts/shots.mjs [http://localhost:5040] [.screenshots]
 * Writes PNGs (1440×900, device scale 2) and fps.json to the folder.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5040';
const out = resolve(process.argv[3] ?? '.screenshots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
	headless: true,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-swiftshader=false'
	]
});

async function open(quality, light) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2
	});
	await context.addInitScript(
		([q, l]) => {
			localStorage.setItem('bastion3d.quality', q);
			localStorage.setItem('bastion3d.light', l);
		},
		[quality, light]
	);
	const page = await context.newPage();
	page.on('pageerror', (error) => console.error('[page]', error.message));
	await page.goto(`${base}/3d?demo`);
	await page.waitForFunction(() => window.__bastionReady === true, null, { timeout: 120_000 });
	// the dock folded away, the meeting not called
	await page.getByRole('button', { name: 'Toggle the feed' }).click();
	await page.waitForTimeout(2500);
	return { context, page };
}

async function fps(page, seconds = 6) {
	const samples = [];
	for (let i = 0; i < seconds; i++) {
		await page.waitForTimeout(1000);
		samples.push(await page.evaluate(() => window.__bastionFps ?? 0));
	}
	samples.sort((a, b) => a - b);
	return samples[Math.floor(samples.length / 2)];
}

const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });
const preset = async (page, label) => {
	await page.getByRole('button', { name: label, exact: true }).click();
	await page.waitForTimeout(1600);
};
const light = async (page, label) => {
	await page.getByRole('button', { name: label, exact: true }).click();
	await page.waitForTimeout(2500);
};

const results = {};
{
	const { context, page } = await open('high', 'golden');
	results.high = await fps(page);
	await shot(page, 'overview-golden');
	await light(page, 'Day');
	await shot(page, 'overview-day');
	await light(page, 'Night');
	await shot(page, 'overview-night');
	await light(page, 'Golden hour');
	for (const [label, name] of [
		['Watch Forge', 'forge'],
		['Boiler House', 'boiler'],
		['Home Cottage', 'cottage'],
		['Vision Tower', 'tower'],
		['Pond', 'pond']
	]) {
		await preset(page, label);
		await shot(page, `preset-${name}`);
	}
	await page.getByRole('button', { name: 'Call meeting' }).first().click();
	await page.waitForTimeout(22_000);
	await shot(page, 'townhall-meeting');
	await context.close();
}
{
	const { context, page } = await open('low', 'golden');
	results.low = await fps(page);
	await shot(page, 'overview-golden-low');
	await context.close();
}
await browser.close();
writeFileSync(join(out, 'fps.json'), JSON.stringify(results, null, '\t') + '\n');
console.log(JSON.stringify(results), 'screenshots in', out);
