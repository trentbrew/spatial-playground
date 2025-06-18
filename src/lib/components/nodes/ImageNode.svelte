<script lang="ts">
	export let id: number;
	export let content: string;
	export let color: string;
	export let isSelected: boolean = false; // Currently unused but kept for future features
	export let isFullscreen: boolean = false; // Currently unused but kept for future features
</script>

<div id={String(id)} class="image-node" style="background-color: {color};">
	{#if content && (content.match(/^(https?:)?\/\//) || content.startsWith('data:image/'))}
		<img src={content} alt="Image node {id}" />
	{:else}
		<div class="placeholder">
			<p>Paste image URL…</p>
			<input type="text" bind:value={content} placeholder="https://example.com/image.jpg" />
		</div>
	{/if}
</div>

<style>
	.image-node {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		overflow: hidden;
	}

	.image-node img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		pointer-events: none;
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #888;
		font-size: 12px;
		padding: 8px;
	}

	.placeholder input {
		width: 100%;
		margin-top: 4px;
		font-size: 12px;
		padding: 4px 6px;
		border: 1px dashed #555;
		border-radius: 4px;
		background: transparent;
		color: inherit;
	}
</style>
