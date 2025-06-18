<script lang="ts">
	import { getTextColorForBackground } from '$lib/utils/colorUtils'; // Import the utility

	// Use $props() rune for component props
	let { id, content, color }: { id: number; content: string; color: string } = $props();

	// Node-specific logic would go here

	// Use $derived rune to calculate text color based on background
	const contrastingTextColor = $derived(getTextColorForBackground(color));
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
		padding: 8px 12px; /* Only top padding for handle */
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
