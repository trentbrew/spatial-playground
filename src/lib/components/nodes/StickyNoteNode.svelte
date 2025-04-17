<script lang="ts">
	export let id: number;
	export let content: string;
	export let color: string;
	// Add other common props like width, height, x, y if needed for internal logic
	// Or rely on the parent component (+page.svelte) to handle positioning/sizing

	// Node-specific logic would go here
</script>

<div class="sticky-note-content" style="background-color: {color};">
	<textarea bind:value={content} placeholder="Write something..."></textarea>
</div>

<style>
	.sticky-note-content {
		width: 100%;
		height: 100%;
		padding: 25px 5px 5px 5px; /* Add padding-top to account for drag handle */
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden; /* Prevent textarea overflow */
		border-radius: 0 0 6px 6px; /* Match parent border radius */
	}
	textarea {
		flex-grow: 1;
		border: none;
		outline: none;
		background-color: transparent;
		resize: none;
		font-family: inherit;
		font-size: 12px;
		width: 100%;
		height: 100%;
	}
</style>
