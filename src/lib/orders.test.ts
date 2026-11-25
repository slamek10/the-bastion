import { describe, expect, it } from 'vitest';
import {
	canMove,
	createOrder,
	moveOrder,
	orchestratorAction,
	OrderError,
	visibleOrders
} from './orders';
import type { WorkOrder } from './types';

const sha = 'abc1234def';

function planned(): WorkOrder {
	let order = createOrder('thermal', ['heat'], 'show the flow temperature', 1, 'o1');
	order = moveOrder(order, 'orchestrator', 'planning', {}, 2);
	return moveOrder(
		order,
		'orchestrator',
		'awaiting_approval',
		{ plan: 'Change X in Y', apps: ['heat', 'ha'] },
		3
	);
}

describe('work orders', () => {
	it('goes filed → plan → your approval → coding → ready → deployed', () => {
		let order = planned();
		expect(order.apps).toEqual(['heat', 'ha']);
		expect(orchestratorAction(order)).toBeUndefined();
		order = moveOrder(order, 'you', 'approved', {}, 4);
		expect(orchestratorAction(order)).toBe('build');
		order = moveOrder(order, 'orchestrator', 'coding', {}, 5);
		order = moveOrder(
			order,
			'orchestrator',
			'ready',
			{ commit: { app: 'heat', branch: 'main', commit: sha, summary: 's' } },
			6
		);
		order = moveOrder(order, 'orchestrator', 'shipping', {}, 7);
		order = moveOrder(order, 'orchestrator', 'deployed', {}, 8);
		expect(order.status).toBe('deployed');
		expect(order.log.map((line) => line.status)).toEqual([
			'new',
			'planning',
			'awaiting_approval',
			'approved',
			'coding',
			'ready',
			'shipping',
			'deployed'
		]);
		expect(canMove(order, 'you', 'cancelled')).toBe(false);
	});

	it('only you can approve, reject or ask for changes', () => {
		const order = planned();
		expect(() => moveOrder(order, 'orchestrator', 'approved')).toThrow(OrderError);
		expect(() => moveOrder(order, 'orchestrator', 'rejected')).toThrow(OrderError);
		expect(() => moveOrder(createOrder('vision', [], 'x'), 'orchestrator', 'coding')).toThrow(
			OrderError
		);
		expect(() => moveOrder(createOrder('vision', [], 'x'), 'you', 'approved')).toThrow(OrderError);
	});

	it('the approved plan cannot be swapped', () => {
		const approved = moveOrder(planned(), 'you', 'approved');
		expect(() => moveOrder(approved, 'orchestrator', 'coding', { plan: 'something else' })).toThrow(
			/only with awaiting_approval/
		);
		expect(() => moveOrder(approved, 'orchestrator', 'awaiting_approval', { plan: 'new' })).toThrow(
			OrderError
		);
	});

	it('asking for changes needs words and sends it back to planning', () => {
		const order = planned();
		expect(() => moveOrder(order, 'you', 'planning')).toThrow(/what to change/);
		const back = moveOrder(order, 'you', 'planning', { text: 'also the return temp' });
		expect(back.feedback).toBe('also the return temp');
		expect(orchestratorAction(back)).toBe('replan');
		const again = moveOrder(back, 'orchestrator', 'awaiting_approval', { plan: 'v2' });
		expect(again.feedback).toBeUndefined();
		expect(again.plan).toBe('v2');
	});

	it('ready needs a real commit', () => {
		const coding = moveOrder(moveOrder(planned(), 'you', 'approved'), 'orchestrator', 'coding');
		expect(() => moveOrder(coding, 'orchestrator', 'ready')).toThrow(/commit/);
		expect(() =>
			moveOrder(coding, 'orchestrator', 'ready', {
				commit: { app: 'heat', branch: 'main', commit: 'not-a-sha', summary: '' }
			})
		).toThrow(/commit/);
	});

	it('you can cancel until it is done', () => {
		expect(moveOrder(createOrder('vision', [], 'x'), 'you', 'cancelled').status).toBe('cancelled');
		expect(() => createOrder('vision', [], '   ')).toThrow(OrderError);
	});

	it('keeps open orders and the last 10 finished', () => {
		const orders = Array.from({ length: 15 }, (_, i) => ({
			...createOrder('vision', [], `o${i}`, i, `o${i}`),
			status: i < 3 ? ('coding' as const) : ('deployed' as const),
			updatedAt: i
		}));
		const visible = visibleOrders(orders);
		expect(visible).toHaveLength(13);
		expect(visible.filter((o) => o.status === 'coding')).toHaveLength(3);
	});
});
