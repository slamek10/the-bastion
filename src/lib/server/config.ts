/**
 * Every setting this app reads, all from the environment (.env, see
 * .env.example). A part whose values are missing reports "not configured";
 * nothing here throws. Read on every call, so tests can change process.env.
 */
import type { AppId } from '$lib/types';

const read = (name: string) => (process.env[name] ?? '').trim();
const url = (name: string) => read(name).replace(/\/$/, '');
const isUrl = (value: string) => /^https?:\/\//.test(value);

export const config = {
	/** Home Assistant itself, for the websocket, services and camera streams */
	get hassUrl() {
		return url('HASS_URL');
	},
	get hassToken() {
		return read('HASS_TOKEN');
	},
	get hass() {
		return isUrl(this.hassUrl) && !!this.hassToken;
	},
	/** bastion-ai: Claude Code on the household's subscription */
	get aiUrl() {
		return url('BASTION_AI_URL');
	},
	get aiToken() {
		return read('BASTION_AI_TOKEN');
	},
	get ai() {
		return isUrl(this.aiUrl) && this.aiToken.length >= 16;
	},
	/** how bastion-ai reaches this app's own /mcp (APP_URL, or BASTION_AI_MCP_URL) */
	get selfUrl() {
		return url('BASTION_AI_MCP_URL').replace(/\/mcp$/, '') || url('APP_URL');
	},
	/** this app's address as people open it; https here makes the login cookie Secure */
	get publicUrl() {
		return url('APP_URL');
	},
	get password() {
		return read('APP_PASSWORD');
	},
	get dataDir() {
		return read('DATA_DIR') || './data';
	}
};

const APP_ENV: Record<AppId, string> = {
	ha: 'HA_APP_URL',
	heat: 'HEAT_URL',
	cams: 'CAMS_URL',
	watch: 'WATCH_URL',
	ai: 'AI_URL'
};

/** another Bastion app's base URL, or undefined when it isn't set */
export function appUrl(app: AppId): string | undefined {
	const value = url(APP_ENV[app]) || (app === 'ai' ? config.aiUrl : '');
	return isUrl(value) ? value : undefined;
}

/** the names, for the hand-off and .env.example */
export const ENV_VARS = [
	'HASS_URL',
	'HASS_TOKEN',
	'BASTION_SESSION_SECRET',
	'APP_PASSWORD',
	'APP_URL',
	'BASTION_AI_URL',
	'BASTION_AI_TOKEN',
	'BASTION_AI_MCP_URL',
	...Object.values(APP_ENV),
	'DATA_DIR'
];
