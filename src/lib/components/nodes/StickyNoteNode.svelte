<script lang="ts">
	import { getTextColorForBackground } from '$lib/utils/colorUtils'; // Import the utility

	export let id: number;
	export let content: string;
	export let color: string;
	// Add other common props like width, height, x, y if needed for internal logic
	// Or rely on the parent component (+page.svelte) to handle positioning/sizing

	// Node-specific logic would go here

	// Reactive declaration to calculate text color based on background
	$: contrastingTextColor = getTextColorForBackground(color);
</script>

<div id={String(id)} class="sticky-note-content outline-none" style="background-color: {color};">
	<textarea
		bind:value={content}
		placeholder="Write something..."
		style="color: {contrastingTextColor};"
	>
	</textarea>
</div>

<style>
	.sticky-note-content {
		width: 100%;
		height: 100%;
		padding: 24px 36px; /* Only top padding for handle */
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden; /* Prevent textarea overflow */
		border-radius: 6px; /* Match parent border radius */
	}
	textarea {
		flex-grow: 1;
		border: none;
		outline: none;
		box-shadow: none;
		border-radius: 12px;
		padding: 6px; /* Add padding directly to textarea */

		background-color: transparent; /* Keep transparent */
		/* color: var(--text-color); */ /* REMOVE: Use inline style now */
		resize: none;
		font-family: inherit;
		font-size: 12px;
		width: 100%;
		height: 100%;
	}
</style>
