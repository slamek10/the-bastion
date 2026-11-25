/**
 * Work orders' rules, shared by the server, the demo and the tests: who may
 * move an order to which status. Only you approve a plan; the orchestrator
 * (with ORDERS_TOKEN) can plan, report coding, ready and shipping, but never
 * approve, and the plan can't change once approved.
 */
import {
	ORDER_DONE,
	ORDER_TARGETS,
	type AgentId,
	type OrderCommit,
	type OrderStatus,
	type OrderTarget,
	type WorkOrder
} from '$lib/types';

export type Actor = 'you' | 'orchestrator';

export class OrderError extends Error {}

const ORCHESTRATOR_MOVES: Record<OrderStatus, OrderStatus[]> = {
	new: ['planning', 'failed'],
	planning: ['awaiting_approval', 'failed'],
	// a better plan before you answer: back to planning
	awaiting_approval: ['planning'],
	approved: ['coding', 'failed'],
	coding: ['ready', 'failed'],
	ready: ['shipping', 'coding', 'failed'],
	shipping: ['deployed', 'rolled_back', 'failed'],
	// a fix after a rollback or failure goes through coding again, under the same approved plan
	rolled_back: ['coding'],
	failed: ['coding'],
	deployed: [],
	rejected: [],
	cancelled: []
};

/** your answers to a plan; cancelling is allowed until it's done */
const YOUR_MOVES: Partial<Record<OrderStatus, OrderStatus[]>> = {
	awaiting_approval: ['approved', 'planning', 'rejected']
};

export function canMove(order: WorkOrder, actor: Actor, to: OrderStatus) {
	if (ORDER_DONE.includes(order.status)) return false;
	if (actor === 'you') return to === 'cancelled' || (YOUR_MOVES[order.status] ?? []).includes(to);
	return ORCHESTRATOR_MOVES[order.status].includes(to);
}

/** what the orchestrator has to do next, or undefined when it's waiting on you or done */
export function orchestratorAction(order: WorkOrder): 'plan' | 'replan' | 'build' | undefined {
	if (order.status === 'new') return 'plan';
	if (order.status === 'planning' && order.feedback) return 'replan';
	if (order.status === 'approved') return 'build';
	return undefined;
}

const ID = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function cleanTargets(value: unknown): OrderTarget[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((t): t is OrderTarget => ORDER_TARGETS.includes(t)))];
}

export function createOrder(
	from: AgentId,
	targets: OrderTarget[],
	request: string,
	now = Date.now(),
	id = ID()
): WorkOrder {
	const text = request.trim();
	if (!text || text.length > 4000) throw new OrderError('request: 1-4000 characters');
	return {
		id,
		createdAt: now,
		updatedAt: now,
		from,
		targets,
		request: text,
		status: 'new',
		apps: targets,
		commits: [],
		log: [{ at: now, by: 'you', status: 'new', text: 'Filed' }]
	};
}

export interface MoveDetails {
	/** a note for the log */
	text?: string;
	/** with awaiting_approval: the plan */
	plan?: string;
	/** with awaiting_approval: the apps the plan touches */
	apps?: OrderTarget[];
	/** with ready (or later): a pushed commit */
	commit?: OrderCommit;
}

const COMMIT = /^[0-9a-f]{7,40}$/;

/** the order after a move; throws OrderError when it isn't allowed */
export function moveOrder(
	order: WorkOrder,
	actor: Actor,
	to: OrderStatus,
	details: MoveDetails = {},
	now = Date.now()
): WorkOrder {
	if (!canMove(order, actor, to))
		throw new OrderError(`${actor} can't move an order from ${order.status} to ${to}`);
	const text = (details.text ?? '').trim().slice(0, 4000);
	const next: WorkOrder = { ...order, status: to, updatedAt: now, log: [...order.log] };

	if (to === 'awaiting_approval') {
		const plan = (details.plan ?? '').trim();
		if (!plan) throw new OrderError('plan: the plan you want approved');
		next.plan = plan.slice(0, 20_000);
		const apps = cleanTargets(details.apps);
		next.apps = apps.length ? apps : order.targets;
		next.feedback = undefined;
	} else if (details.plan !== undefined) {
		throw new OrderError('plan: only with awaiting_approval');
	}
	if (actor === 'you' && to === 'planning') {
		if (!text) throw new OrderError('text: what to change in the plan');
		next.feedback = text;
	}
	if (details.commit) {
		const c = details.commit;
		if (!ORDER_TARGETS.includes(c.app) || !COMMIT.test(c.commit) || !c.branch)
			throw new OrderError('commit: { app, branch, commit (sha), summary }');
		next.commits = [
			...order.commits.filter((old) => !(old.app === c.app && old.commit === c.commit)),
			{
				app: c.app,
				branch: String(c.branch).slice(0, 100),
				commit: c.commit,
				summary: String(c.summary ?? '').slice(0, 300)
			}
		];
	}
	if (to === 'ready' && !next.commits.length)
		throw new OrderError('commit: ready needs the pushed commit');

	next.log.push({ at: now, by: actor, status: to, text: text || defaultText(to) });
	if (next.log.length > 200) next.log = next.log.slice(-200);
	return next;
}

/** a note without a status change */
export function noteOrder(
	order: WorkOrder,
	actor: Actor,
	text: string,
	now = Date.now()
): WorkOrder {
	const line = text.trim().slice(0, 4000);
	if (!line) throw new OrderError('text: the note');
	return {
		...order,
		updatedAt: now,
		log: [...order.log, { at: now, by: actor, text: line }].slice(-200)
	};
}

function defaultText(status: OrderStatus) {
	const words: Record<OrderStatus, string> = {
		new: 'Filed',
		planning: 'Planning',
		awaiting_approval: 'Plan ready for your approval',
		approved: 'Approved',
		coding: 'Coding',
		ready: 'Ready to ship',
		shipping: 'Shipping',
		deployed: 'Deployed and healthy',
		rolled_back: 'Rolled back',
		failed: 'Failed',
		rejected: 'Rejected',
		cancelled: 'Cancelled'
	};
	return words[status];
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
	new: 'Filed',
	planning: 'Planning',
	awaiting_approval: 'Needs your approval',
	approved: 'Approved',
	coding: 'Coding',
	ready: 'Ready to ship',
	shipping: 'Shipping',
	deployed: 'Deployed',
	rolled_back: 'Rolled back',
	failed: 'Failed',
	rejected: 'Rejected',
	cancelled: 'Cancelled'
};

/** which robot stands for a target */
export const TARGET_AGENT: Record<OrderTarget, AgentId> = {
	watch: 'watchdog',
	ai: 'orchestrator',
	bastion: 'orchestrator',
	heat: 'thermal',
	ha: 'homekeeper',
	cams: 'vision'
};

/** the target a robot files for by default */
export const AGENT_TARGET: Record<AgentId, OrderTarget | undefined> = {
	watchdog: 'watch',
	orchestrator: undefined,
	thermal: 'heat',
	homekeeper: 'ha',
	vision: 'cams'
};

/** the orders worth keeping in telemetry: every open one and the last 10 finished */
export function visibleOrders(orders: WorkOrder[]) {
	const open = orders.filter((order) => !ORDER_DONE.includes(order.status));
	const done = orders
		.filter((order) => ORDER_DONE.includes(order.status))
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 10);
	return [...open, ...done].sort((a, b) => b.createdAt - a.createdAt);
}
