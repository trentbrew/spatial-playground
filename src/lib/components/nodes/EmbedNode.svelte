<script lang="ts">
	export let id: number;
	export let content: string;
	export let color: string;
	export let isSelected: boolean = false;
	export let isFullscreen: boolean = false;
</script>

<div id={String(id)} class="embed-node" style="background-color: {color};">
	{#if content && content.match(/^(https?:)?\/\//)}
		<iframe
			src={content}
			title="Embed {id}"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowfullscreen
		></iframe>
	{:else}
		<div class="placeholder">
			<p>Paste embed URL…</p>
			<input type="text" bind:value={content} placeholder="https://example.com" />
		</div>
	{/if}
</div>

<style>
	.embed-node {
		width: 100%;
		height: 100%;
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.embed-node iframe {
		width: 100%;
		height: 100%;
		border: none;
		pointer-events: auto;
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: #888;
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
