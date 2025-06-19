<script>
	import '../app.css';
	import CustomCursor from '$lib/components/CustomCursor.svelte';
</script>

<CustomCursor />

{#await Promise.resolve() then _}
	<slot />
{:catch error}
	<div class="global-error-boundary">
		<h2>Something went wrong</h2>
		<p>{error?.message || 'An unexpected error occurred.'}</p>
		<button onclick={() => location.reload()}>Reload</button>
	</div>
{/await}

<style>
	.global-error-boundary {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		background: #18181b;
		color: #fff;
		font-family: inherit;
		gap: 1.5rem;
	}
	.global-error-boundary button {
		padding: 0.5rem 1.5rem;
		font-size: 1.1rem;
		border-radius: 6px;
		border: none;
		background: #333;
		color: #fff;
		cursor: pointer;
		transition: background 0.2s;
	}
	.global-error-boundary button:hover {
		background: #444;
	}
</style>
