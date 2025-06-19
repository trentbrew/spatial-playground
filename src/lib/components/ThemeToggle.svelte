<script lang="ts">
	import { theme } from '$lib/stores/themeStore';
	import { Sun, Moon } from '@lucide/svelte';

	function toggleTheme() {
		theme.update((current) => (current === 'light' ? 'dark' : 'light'));
	}
</script>

<button on:click={toggleTheme} data-cursor="button" aria-label="Toggle theme">
	{#if $theme === 'light'}
		<Moon />
	{:else}
		<Sun />
	{/if}
</button>

<style>
	button {
		background: none;
		border: none;
		padding: 8px 10px; /* Adjust padding */
		cursor: pointer;
		font-size: 18px; /* Adjust icon size */
		line-height: 1;
		border-radius: 4px; /* Optional: match other buttons */
		transition: background-color 0.2s ease;
	}
	button:hover {
		background-color: rgba(128, 128, 128, 0.2); /* Subtle hover */
	}

	span {
		display: inline-block;
		transition: transform 0.3s ease-in-out;
	}

	/* Optional: add a little spin on toggle */
	button:active span {
		transform: rotate(360deg);
	}
</style>
