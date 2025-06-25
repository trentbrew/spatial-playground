<script lang="ts">
	export let error: Error;
	export let status: number;
</script>

<div class="error-boundary">
	<h1>Something went wrong</h1>
	<h2>Status: {status}</h2>
	<pre class="error-message">{error.message}</pre>
	<pre class="error-stack">{error.stack}</pre>
</div>

<style>
	.error-boundary {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: #18181b;
		color: #fff;
		font-family: inherit;
		gap: 1.5rem;
		padding: 2rem;
	}
	.error-message {
		color: #ff6b6b;
		font-size: 1.2rem;
		font-weight: bold;
		margin-bottom: 1rem;
	}
	.error-stack {
		color: #aaa;
		font-size: 0.95rem;
		background: #23232a;
		padding: 1rem;
		border-radius: 8px;
		max-width: 90vw;
		overflow-x: auto;
	}
</style>
