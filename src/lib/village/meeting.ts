/**
 * The town-hall meeting: who sits where. The Orchestrator takes the head
 * of the table (chair 0, facing the door); the others follow in order.
 */
import { AGENT_IDS, type AgentId } from '$lib/types';
import { CHAIRS } from './layout';

export function meetingSeats(agents: AgentId[] = AGENT_IDS): Record<AgentId, number> {
	const ordered = ['orchestrator' as AgentId, ...agents.filter((id) => id !== 'orchestrator')];
	const seats = {} as Record<AgentId, number>;
	ordered.forEach((id, index) => {
		if (index < CHAIRS.length && agents.includes(id)) seats[id] = index;
	});
	return seats;
}

export const chairOf = (id: AgentId) => CHAIRS[meetingSeats()[id]];
