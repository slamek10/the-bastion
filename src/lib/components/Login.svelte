<script lang="ts">
	import Icon from '@iconify/svelte';

	let { passwordLogin }: { passwordLogin: boolean } = $props();

	let password = $state('');
	let locked = $state(false);
	let wrong = $state(false);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const response = await fetch('/_api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password })
		});
		busy = false;
		if (response.ok) location.reload();
		else {
			wrong = true;
			locked = response.status === 429;
		}
	}
</script>

<div class="center">
	<form class="card glass" onsubmit={submit}>
		<Icon icon="mdi:castle" height="2.6rem" />
		<h1>The Bastion</h1>
		<p class="dim">Signed in to any Bastion app on this server? Reload this page.</p>
		{#if passwordLogin}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="password"
				bind:value={password}
				placeholder="Password"
				autofocus
				autocomplete="current-password"
			/>
			{#if wrong}<p class="error">
					{locked ? 'Too many tries, wait a few minutes.' : 'Wrong password.'}
				</p>{/if}
			<button disabled={busy || !password}>Sign in</button>
		{:else}
			<p class="dim">No APP_PASSWORD here: sign in through Bastion HA, Heat, Cams or Watch.</p>
		{/if}
		<a href="/3d?demo" class="dim">Try the demo</a>
	</form>
</div>

<style>
	.center {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		width: min(22rem, 100%);
		padding: 2rem 1.6rem;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-weight: 400;
	}

	p {
		margin: 0;
		font-size: 0.85rem;
	}

	input,
	button {
		width: 100%;
		box-sizing: border-box;
		justify-content: center;
	}

	.error {
		color: var(--bad);
	}

	a {
		font-size: 0.8rem;
	}
</style>
