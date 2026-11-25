<script lang="ts">
	/**
	 * The 3D view: renderer, scene, OrbitControls with damping, camera presets
	 * (position and target eased over ~0.8 s), click selection by raycast, and
	 * the robots' nameplates projected to the screen each frame. Rendering
	 * pauses while the tab is hidden. Everything made here is disposed when the
	 * component goes away (renderer.dispose + forceContextLoss included).
	 */
	import {
		ACESFilmicToneMapping,
		PerspectiveCamera,
		Raycaster,
		SRGBColorSpace,
		Scene,
		Vector2,
		Vector3,
		WebGLRenderer,
		type Object3D
	} from 'three';
	import { untrack } from 'svelte';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { buildHouse } from './scene/house';
	import { buildServerBunker } from './scene/serverBunker';
	import { buildNeuralCore } from './scene/neuralCore';
	import { buildClimateDeck } from './scene/climateDeck';
	import { buildHaStudio } from './scene/haStudio';
	import { buildWatchtower } from './scene/watchtower';
	import { buildAgents, AGENT_NAMES, MODE_COLOR, type AgentMode } from './agents/agent';
	import { damp, type FrameContext, type Pick, type SceneModule } from './scene/common';
	import { projectToScreen } from './projection';
	import { presetById, ROOM_PRESET } from './presets';
	import { allOf } from '$lib/bindings';
	import { AGENT_IDS, type AgentId } from '$lib/types';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';
	import { AGENT_ROOM } from './agents/agent';

	let { store, dev = false }: { store: Bastion3DState; dev?: boolean } = $props();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	const plates: Partial<Record<AgentId, HTMLDivElement>> = {};
	let modes: Record<AgentId, AgentMode> = $state(
		Object.fromEntries(AGENT_IDS.map((id) => [id, 'IDLE'])) as Record<AgentId, AgentMode>
	);

	const transcript = $derived.by(() => {
		const voice = store.telemetry.voice;
		if (voice.phase === 'idle') return '';
		if (voice.phase === 'wake') return '…';
		if ((voice.phase === 'answer' || voice.phase === 'speaking') && voice.answer)
			return voice.answer;
		return voice.heard ? `“${voice.heard}”` : '';
	});

	// the tween the presets start; the render loop moves the camera along it
	let tween:
		{ from: Vector3; fromTarget: Vector3; to: Vector3; toTarget: Vector3; t: number } | undefined;
	let camera: PerspectiveCamera | undefined;
	let controls: OrbitControls | undefined;

	$effect(() => {
		// read both: the same preset asked for again still flies back
		const preset = presetById(store.preset);
		void store.presetNonce;
		if (!camera || !controls) return;
		tween = {
			from: camera.position.clone(),
			fromTarget: controls.target.clone(),
			to: new Vector3(...preset.position),
			toTarget: new Vector3(...preset.target),
			t: 0
		};
	});

	const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

	function onPick(pick: Pick, object: Object3D) {
		if (pick.kind === 'agent') {
			store.select({ kind: 'agent', id: pick.id });
			store.goto(ROOM_PRESET[AGENT_ROOM[pick.id]]);
		} else if (pick.kind === 'room') {
			store.select({ kind: 'room', id: pick.id });
			store.goto(ROOM_PRESET[pick.id]);
		} else {
			const cameras = allOf(store.bindings, pick.room, 'camera');
			const index = Number(object.userData.cameraIndex ?? 0);
			store.select({ kind: 'room', id: 'watchtower' });
			store.cameraModal = cameras[index] ?? cameras[0] ?? '';
		}
	}

	// built once: untracked, so store changes read inside don't rebuild the renderer
	$effect(() => untrack(setup));

	function setup() {
		const renderer = new WebGLRenderer({
			canvas,
			antialias: true,
			powerPreference: 'high-performance'
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.outputColorSpace = SRGBColorSpace;
		renderer.toneMapping = ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.05;

		const scene = new Scene();
		const cam = new PerspectiveCamera(45, 1, 0.1, 200);
		const start = presetById(store.preset);
		cam.position.set(...start.position);
		const orbit = new OrbitControls(cam, renderer.domElement);
		orbit.target.set(...start.target);
		orbit.enableDamping = true;
		orbit.dampingFactor = 0.08;
		orbit.maxPolarAngle = Math.PI * 0.49;
		orbit.minDistance = 2;
		orbit.maxDistance = 60;
		orbit.addEventListener('start', () => (tween = undefined));
		camera = cam;
		controls = orbit;

		const modules: SceneModule[] = [
			buildHouse(scene),
			buildServerBunker(),
			buildNeuralCore(),
			buildClimateDeck(),
			buildHaStudio(),
			buildWatchtower()
		];
		const agents = buildAgents();
		for (const module of modules) scene.add(module.group);
		scene.add(agents.group);

		// size
		const resize = () => {
			const { clientWidth: w, clientHeight: h } = host;
			if (!w || !h) return;
			renderer.setSize(w, h, false);
			renderer.domElement.style.width = `${w}px`;
			renderer.domElement.style.height = `${h}px`;
			cam.aspect = w / h;
			cam.updateProjectionMatrix();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(host);
		resize();

		// clicks (not drags) pick
		const raycaster = new Raycaster();
		const pointer = new Vector2();
		let down: { x: number; y: number } | undefined;
		const onDown = (event: PointerEvent) => (down = { x: event.clientX, y: event.clientY });
		const onUp = (event: PointerEvent) => {
			if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
			const rect = renderer.domElement.getBoundingClientRect();
			pointer.set(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				-((event.clientY - rect.top) / rect.height) * 2 + 1
			);
			raycaster.setFromCamera(pointer, cam);
			const hit = raycaster
				.intersectObjects(scene.children, true)
				.find((intersection) => intersection.object.userData.pick);
			if (hit) onPick(hit.object.userData.pick as Pick, hit.object);
			else store.select(null);
		};
		renderer.domElement.addEventListener('pointerdown', onDown);
		renderer.domElement.addEventListener('pointerup', onUp);

		// the loop, paused while hidden
		let frame = 0;
		let last = performance.now();
		let time = 0;
		let day = store.dayMode === 'day' ? 1 : 0;
		const ctx: FrameContext = {
			t: store.telemetry,
			bindings: store.bindings,
			time: 0,
			day,
			agentsBusy: false
		};
		const loop = (now: number) => {
			frame = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			time += dt;
			day = damp(day, store.dayMode === 'day' ? 1 : 0, 3, dt);
			ctx.t = store.telemetry;
			ctx.bindings = store.bindings;
			ctx.time = time;
			ctx.day = day;
			ctx.agentsBusy = AGENT_IDS.some((id) => ctx.t.agents[id]?.busy);

			if (tween) {
				tween.t = Math.min(1, tween.t + dt / 0.8);
				const k = ease(tween.t);
				cam.position.lerpVectors(tween.from, tween.to, k);
				orbit.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
				if (tween.t >= 1) tween = undefined;
			}
			orbit.update();
			for (const module of modules) module.update(dt, ctx);
			agents.update(dt, ctx);
			renderer.render(scene, cam);

			// nameplates
			const w = host.clientWidth;
			const h = host.clientHeight;
			for (const [id, actor] of agents.actors) {
				const plate = plates[id];
				if (!plate) continue;
				const point = projectToScreen(actor.anchor, cam, w, h, 40);
				if (point.visible) {
					plate.style.display = '';
					plate.style.transform = `translate(-50%, -100%) translate(${point.x}px, ${point.y}px)`;
				} else plate.style.display = 'none';
				if (modes[id] !== actor.mode) modes[id] = actor.mode;
			}
		};
		const onVisibility = () => {
			cancelAnimationFrame(frame);
			if (!document.hidden) {
				last = performance.now();
				frame = requestAnimationFrame(loop);
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		frame = requestAnimationFrame(loop);
		// the leak check: after the first frames, and again at dispose (it must go back to 0)
		const memoryLog = setTimeout(
			() => dev && console.debug(`[3d] in use ${JSON.stringify(renderer.info.memory)}`),
			500
		);

		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(memoryLog);
			document.removeEventListener('visibilitychange', onVisibility);
			observer.disconnect();
			renderer.domElement.removeEventListener('pointerdown', onDown);
			renderer.domElement.removeEventListener('pointerup', onUp);
			const before = { ...renderer.info.memory };
			for (const module of modules) module.dispose();
			agents.dispose();
			scene.clear();
			orbit.dispose();
			renderer.renderLists.dispose();
			if (dev)
				console.debug(
					`[3d] disposed ${JSON.stringify(before)} → ${JSON.stringify(renderer.info.memory)}`
				);
			renderer.dispose();
			renderer.forceContextLoss();
			camera = undefined;
			controls = undefined;
			tween = undefined;
		};
	}

	const hex = (mode: AgentMode) => `#${MODE_COLOR[mode].toString(16).padStart(6, '0')}`;
</script>

<div class="viewport" bind:this={host}>
	<canvas bind:this={canvas}></canvas>
	{#each AGENT_IDS as id (id)}
		{@const mode = modes[id]}
		{@const agent = store.telemetry.agents[id]}
		<div
			class="plate"
			class:selected={store.selection?.kind === 'agent' && store.selection.id === id}
			bind:this={plates[id]}
			style="display: none; --mode: {hex(mode)}"
		>
			{#if id === 'orchestrator' && transcript}
				<div class="transcript">{transcript}</div>
			{/if}
			<button
				class="badge"
				onclick={() => {
					store.select({ kind: 'agent', id });
					store.goto(ROOM_PRESET[AGENT_ROOM[id]]);
				}}
			>
				<span class="dot"></span>
				<span class="name">{AGENT_NAMES[id]}</span>
				<span class="mode">{agent?.state === 'waiting' ? 'WAITING' : mode}</span>
			</button>
		</div>
	{/each}
</div>

<style>
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.viewport :global(canvas) {
		display: block;
		touch-action: none;
	}

	.plate {
		position: absolute;
		left: 0;
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		pointer-events: none;
		will-change: transform;
	}

	.badge {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.22rem 0.6rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--mode) 55%, transparent);
		background: rgba(8, 12, 28, 0.62);
		backdrop-filter: blur(10px);
		color: white;
		font: inherit;
		font-size: 0.72rem;
		white-space: nowrap;
		cursor: pointer;
	}

	.selected .badge {
		background: color-mix(in srgb, var(--mode) 30%, rgba(8, 12, 28, 0.7));
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--mode);
		box-shadow: 0 0 8px var(--mode);
	}

	.mode {
		opacity: 0.65;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
	}

	.transcript {
		max-width: 16rem;
		padding: 0.45rem 0.7rem;
		border-radius: 0.8rem;
		border: 1px solid rgba(74, 222, 128, 0.4);
		background: rgba(4, 18, 12, 0.72);
		backdrop-filter: blur(10px);
		color: #dcfce7;
		font-size: 0.78rem;
		line-height: 1.35;
		text-align: center;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
