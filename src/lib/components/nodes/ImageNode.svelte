<script lang="ts">
	// Use $props() rune for component props
	let {
		id,
		content,
		color,
		isSelected = false,
		isFullscreen = false
	}: {
		id: number;
		content: string | any;
		color: string;
		isSelected?: boolean;
		isFullscreen?: boolean;
	} = $props();

	// Safely extract string content for image URL
	let imageUrl = $state('');
	$effect(() => {
		if (typeof content === 'string') {
			imageUrl = content;
		} else if (content && typeof content === 'object') {
			imageUrl = content.url || content.src || content.body || '';
		} else {
			imageUrl = '';
		}
	});
</script>

<div id={String(id)} class="image-node">
	{#if imageUrl && (imageUrl.match(/^(https?:)?\/\//) || imageUrl.startsWith('data:image/') || imageUrl.startsWith('/'))}
		<img src={imageUrl} alt="Image node {id}" />
	{:else}
		<div class="placeholder">
			<p>Paste image URL…</p>
			<input
				type="text"
				value={imageUrl}
				oninput={(e) => {
					const input = e.target as HTMLInputElement;
					imageUrl = input.value;
					// Update the content in the store
					import('$lib/stores/canvasStore.svelte').then(({ canvasStore }) => {
						canvasStore.updateBox(id, { content: input.value });
					});
				}}
				placeholder="https://example.com/image.jpg"
			/>
		</div>
	{/if}
</div>

<style>
	.image-node {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		overflow: hidden;
		background: transparent;
	}

	.image-node img {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		object-fit: cover;
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
