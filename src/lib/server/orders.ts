/**
 * Work orders on the server: kept in data/orders.json, shown in the
 * telemetry (open ones and the last few finished), and streamed to the
 * orchestrator session on the Mac (/orders/events) so it knows when to
 * plan, re-plan or build.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual, createHash } from 'node:crypto';
import { config } from '$lib/server/config';
import { hub } from '$lib/server/telemetry';
import {
	createOrder,
	moveOrder,
	noteOrder,
	orchestratorAction,
	visibleOrders,
	type Actor,
	type MoveDetails,
	OrderError
} from '$lib/orders';
import {
	ORDER_REPO,
	type AgentId,
	type OrderStatus,
	type OrderTarget,
	type WorkOrder
} from '$lib/types';

const KEEP = 200;
const file = () => join(config.dataDir, 'orders.json');

type Listener = (order: WorkOrder) => void;

const global = globalThis as unknown as {
	__bastionOrders?: {
		list: WorkOrder[];
		loaded: boolean;
		listeners: Set<Listener>;
		chain: Promise<unknown>;
	};
};
const state = (global.__bastionOrders ??= {
	list: [],
	loaded: false,
	listeners: new Set(),
	chain: Promise.resolve()
});

async function load() {
	if (state.loaded) return;
	state.loaded = true;
	try {
		const data = JSON.parse(await readFile(file(), 'utf8'));
		if (Array.isArray(data)) state.list = data;
	} catch {
		state.list = [];
	}
	publish();
}

async function save() {
	await mkdir(config.dataDir, { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(state.list, null, '\t') + '\n');
	await rename(tmp, file());
}

function publish() {
	const orders = visibleOrders(state.list);
	hub.update((s) => ({ ...s, orders }));
}

/** one change at a time, so two requests never overwrite each other's order */
function serial<T>(fn: () => Promise<T>): Promise<T> {
	const run = state.chain.then(fn, fn);
	state.chain = run.catch(() => {});
	return run;
}

export async function listOrders() {
	await load();
	return state.list;
}

export async function getOrder(id: string) {
	await load();
	return state.list.find((order) => order.id === id);
}

async function store(order: WorkOrder) {
	const index = state.list.findIndex((o) => o.id === order.id);
	if (index >= 0) state.list[index] = order;
	else state.list.unshift(order);
	if (state.list.length > KEEP) state.list.length = KEEP;
	await save();
	publish();
	for (const listener of [...state.listeners]) listener(order);
}

export function fileOrder(from: AgentId, targets: OrderTarget[], request: string) {
	return serial(async () => {
		await load();
		const order = createOrder(from, targets, request);
		await store(order);
		hub.event(
			'bastion',
			'info',
			`Change requested${targets.length ? ` for ${targets.map((t) => ORDER_REPO[t]).join(', ')}` : ''}: ${order.request.slice(0, 100)}`
		);
		return order;
	});
}

export function updateOrder(
	id: string,
	actor: Actor,
	to: OrderStatus | undefined,
	details: MoveDetails = {}
) {
	return serial(async () => {
		await load();
		const order = state.list.find((o) => o.id === id);
		if (!order) throw new OrderError('no such order');
		const next = to
			? moveOrder(order, actor, to, details)
			: noteOrder(order, actor, details.text ?? '');
		await store(next);
		if (to) {
			const level =
				to === 'failed' || to === 'rolled_back'
					? 'alert'
					: to === 'awaiting_approval'
						? 'warn'
						: 'info';
			hub.event(
				'bastion',
				level,
				`Order ${id}: ${next.log[next.log.length - 1].text.slice(0, 140)}`
			);
		}
		return next;
	});
}

/** each change to an order, for the orchestrator's stream */
export function onOrder(listener: Listener) {
	state.listeners.add(listener);
	return () => state.listeners.delete(listener);
}

/** loads the file at start, so the telemetry has the orders before anyone asks */
export function startOrders() {
	load().catch((error) => console.warn('[orders] load', error));
}

/** the orchestrator's token, compared in constant time */
export function orchestratorAuthorized(header: string | null) {
	const wanted = config.ordersToken;
	const given = header?.match(/^Bearer\s+(\S+)$/)?.[1] ?? '';
	if (!wanted || !given) return false;
	const a = createHash('sha256').update(given).digest();
	const b = createHash('sha256').update(wanted).digest();
	return timingSafeEqual(a, b);
}

/** what the orchestrator gets for an order: everything, plus what it should do now */
export function forOrchestrator(order: WorkOrder) {
	return {
		...order,
		action: orchestratorAction(order) ?? null,
		repos: order.apps.map((app) => ORDER_REPO[app])
	};
}
