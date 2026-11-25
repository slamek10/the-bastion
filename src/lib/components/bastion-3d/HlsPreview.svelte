<script lang="ts">
	/**
	 * A camera's live stream: The Bastion asks Home Assistant for an HLS
	 * stream (/_api/camera/stream) and plays it through its own /hls proxy,
	 * with hls.js (or the browser's own HLS). The same recovery as Bastion HA's
	 * HLS.svelte; Hls is destroyed when this closes.
	 */
	import { tick } from 'svelte';
	import Icon from '@iconify/svelte';
	import type Hls from 'hls.js';
	import type { Bastion3DState } from '$lib/stores/bastion3d.svelte';

	let {
		store,
		entityId,
		controls = false
	}: { store: Bastion3DState; entityId: string; controls?: boolean } = $props();

	let video: HTMLVideoElement | undefined = $state();
	let status: 'loading' | 'playing' | 'error' = $state('loading');
	let error = $state('');
	let url: string | undefined = $state();

	$effect(() => {
		const id = entityId;
		let hls: Hls | undefined;
		let cancelled = false;
		status = 'loading';
		error = '';
		url = undefined;

		(async () => {
			if (!id) {
				status = 'error';
				error = 'No camera bound to this room';
				return;
			}
			const result = await store.cameraUrl(id);
			if (cancelled) return;
			if (!result.url) {
				status = 'error';
				error = result.error ?? 'No stream';
				return;
			}
			url = result.url;
			await tick();
			if (cancelled || !video) return;
			const { default: HlsClass } = await import('hls.js');
			if (cancelled || !video) return;
			if (HlsClass.isSupported()) {
				hls = new HlsClass({
					backBufferLength: 60,
					fragLoadingTimeOut: 30000,
					manifestLoadingTimeOut: 30000,
					levelLoadingTimeOut: 30000,
					maxLiveSyncPlaybackRate: 2,
					lowLatencyMode: true
				});
				const source = result.url;
				hls.on(HlsClass.Events.MEDIA_ATTACHED, () => hls?.loadSource(source));
				hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
					status = 'playing';
					video?.play().catch(() => {});
				});
				hls.on(HlsClass.Events.ERROR, (_event, data) => {
					if (!data.fatal) return;
					if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
					else if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
					else {
						status = 'error';
						error = data.details;
						hls?.destroy();
						hls = undefined;
					}
				});
				hls.attachMedia(video);
			} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
				video.src = result.url;
				video.addEventListener('loadedmetadata', () => {
					status = 'playing';
					video?.play().catch(() => {});
				});
			} else {
				status = 'error';
				error = 'This browser cannot play HLS';
			}
		})();

		return () => {
			cancelled = true;
			hls?.destroy();
			hls = undefined;
			if (video) {
				video.pause();
				video.removeAttribute('src');
				video.load();
			}
		};
	});
</script>

<div class="hls">
	{#if url}
		<video bind:this={video} muted playsinline autoplay {controls}></video>
	{/if}
	{#if status !== 'playing'}
		<div class="overlay">
			{#if status === 'loading'}
				<Icon icon="mdi:loading" class="spin" height="1.6rem" />
			{:else}
				<Icon icon="mdi:cctv-off" height="1.6rem" />
				<span>{error}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.hls {
		position: relative;
		aspect-ratio: 16 / 9;
		border-radius: 0.8rem;
		overflow: hidden;
		background: #000;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
		text-align: center;
		padding: 1rem;
	}

	.overlay :global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
