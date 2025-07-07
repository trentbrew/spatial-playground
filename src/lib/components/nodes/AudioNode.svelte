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

	// Safely extract string content for audio URL
	let audioUrl = $state('');
	$effect(() => {
		if (typeof content === 'string') {
			audioUrl = content;
		} else if (content && typeof content === 'object') {
			audioUrl = content.url || content.src || content.body || '';
		} else {
			audioUrl = '';
		}
	});

	// File upload handling
	let fileInput: HTMLInputElement;

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file && file.type.startsWith('audio/')) {
			// Create a temporary URL for the uploaded file
			const url = URL.createObjectURL(file);
			audioUrl = url;

			// Update the content in the store
			import('$lib/stores/canvasStore.svelte').then(({ canvasStore }) => {
				canvasStore.updateBox(id, { content: url });
			});
		}
	}

	function triggerFileUpload() {
		fileInput?.click();
	}
</script>

<div id={String(id)} class="audio-node">
	{#if audioUrl}
		<audio controls src={audioUrl}> Your browser does not support the audio element. </audio>
	{:else}
		<div class="upload-prompt" onclick={triggerFileUpload}>
			<svg
				class="upload-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M9 18V5l12-2v13" />
				<circle cx="6" cy="18" r="3" />
				<circle cx="18" cy="16" r="3" />
			</svg>
			<p>Click to upload audio</p>
			<input
				bind:this={fileInput}
				type="file"
				accept="audio/*"
				onchange={handleFileSelect}
				style="display: none;"
			/>
		</div>
	{/if}
</div>

<style>
	.audio-node {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: transparent;
		border-radius: 6px;
	}

	.audio-node audio {
		width: 100%;
		max-width: 300px;
	}

	.upload-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 20px;
		cursor: pointer;
		color: #888;
		transition: color 0.2s;
		width: 100%;
		height: 100%;
	}

	.upload-prompt:hover {
		color: #aaa;
	}

	.upload-icon {
		width: 48px;
		height: 48px;
		opacity: 0.5;
	}

	.upload-prompt p {
		font-size: 14px;
		margin: 0;
	}
</style>
