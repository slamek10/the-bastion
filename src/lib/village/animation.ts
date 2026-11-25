/**
 * Which animation an agent plays, from its state: pure, so it can be tested.
 * The clips come from Quaternius' Universal Animation Library (anims.glb);
 * a wave is its "Interact" (the nearest it has).
 */
export type AgentMode = 'IDLE' | 'WORKING' | 'COLLAB' | 'ALERT' | 'SPEAKING' | 'MEETING';

export type Clip = 'idle' | 'walk' | 'run' | 'sit' | 'sitTalk' | 'talk' | 'work' | 'wave';

export const CLIP_NAMES: Record<Clip, string> = {
	idle: 'Idle_Loop',
	walk: 'Walk_Loop',
	run: 'Jog_Fwd_Loop',
	sit: 'Sitting_Idle_Loop',
	sitTalk: 'Sitting_Talking_Loop',
	talk: 'Idle_Talking_Loop',
	work: 'Fixing_Kneeling',
	wave: 'Interact'
};

export interface Pose {
	mode: AgentMode;
	/** what its feet are doing */
	motion: 'still' | 'walk' | 'run';
	/** in its chair at the meeting table */
	seated: boolean;
	/** its answer is streaming (or, for the Orchestrator, the voice assistant speaks) */
	speaking: boolean;
	/** waving at someone passing */
	waving: boolean;
}

export function animationFor(pose: Pose): Clip {
	if (pose.motion === 'run') return 'run';
	if (pose.motion === 'walk') return 'walk';
	if (pose.seated) return pose.speaking ? 'sitTalk' : 'sit';
	if (pose.waving) return 'wave';
	switch (pose.mode) {
		case 'SPEAKING':
		case 'COLLAB':
			return 'talk';
		case 'WORKING':
			return 'work';
		case 'MEETING':
			// still on its way to the chair, standing
			return pose.speaking ? 'talk' : 'idle';
		default:
			return pose.speaking ? 'talk' : 'idle';
	}
}

/** walking and running speeds (m/s), matched to the clips' strides */
// the people are 1.4× life size (PEOPLE_SCALE): their strides are longer
export const SPEED = { walk: 1.7, jog: 3.4, run: 4.6 };
