/**
 * bastion-ai answers two turns at once (MAX_TURNS); more wait there. Here
 * each robot runs one turn at a time, and at most two run together, so a
 * turn never waits invisibly inside bastion-ai: the robot shows "waiting".
 */
export interface QueueHooks {
	/** the job is waiting; position 1 is next */
	onWaiting?: (position: number) => void;
	onStart?: () => void;
}

interface Job {
	key: string;
	run: () => Promise<void>;
	hooks: QueueHooks;
	resolve: () => void;
	reject: (error: unknown) => void;
}

export class TurnQueue {
	private running = new Set<string>();
	private waiting: Job[] = [];

	constructor(private max = 2) {}

	/** how many run now, and which keys */
	get active() {
		return [...this.running];
	}

	get queued() {
		return this.waiting.map((job) => job.key);
	}

	/** runs fn when its key is free and a slot is; resolves when fn is done */
	run(key: string, fn: () => Promise<void>, hooks: QueueHooks = {}) {
		return new Promise<void>((resolve, reject) => {
			this.waiting.push({ key, run: fn, hooks, resolve, reject });
			this.pump();
			this.report();
		});
	}

	/** a waiting job taken back (the browser went away before it started) */
	cancel(key: string, fn: () => Promise<void>) {
		const index = this.waiting.findIndex((job) => job.key === key && job.run === fn);
		if (index < 0) return false;
		const [job] = this.waiting.splice(index, 1);
		job.resolve();
		this.report();
		return true;
	}

	private report() {
		this.waiting.forEach((job, index) => job.hooks.onWaiting?.(index + 1));
	}

	private pump() {
		for (let i = 0; i < this.waiting.length && this.running.size < this.max;) {
			const job = this.waiting[i];
			if (this.running.has(job.key)) {
				i++;
				continue;
			}
			this.waiting.splice(i, 1);
			this.running.add(job.key);
			job.hooks.onStart?.();
			Promise.resolve()
				.then(job.run)
				.then(job.resolve, job.reject)
				.finally(() => {
					this.running.delete(job.key);
					this.pump();
					this.report();
				});
		}
	}
}
