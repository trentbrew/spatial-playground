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

	// Safely extract string content for PDF URL
	let pdfUrl = $state('');
	$effect(() => {
		if (typeof content === 'string') {
			pdfUrl = content;
		} else if (content && typeof content === 'object') {
			pdfUrl = content.url || content.src || content.body || '';
		} else {
			pdfUrl = '';
		}
	});

	// File upload handling
	let fileInput: HTMLInputElement;

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file && file.type === 'application/pdf') {
			// Create a temporary URL for the uploaded file
			const url = URL.createObjectURL(file);
			pdfUrl = url;

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

<div id={String(id)} class="pdf-node">
	{#if pdfUrl}
		<iframe src={pdfUrl} title="PDF viewer for node {id}" />
	{:else}
		<div class="upload-prompt" onclick={triggerFileUpload}>
			<svg
				class="upload-icon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<polyline points="14 2 14 8 20 8" />
				<line x1="12" y1="18" x2="12" y2="12" />
				<line x1="9" y1="15" x2="15" y2="15" />
			</svg>
			<p>Click to upload PDF</p>
			<input
				bind:this={fileInput}
				type="file"
				accept="application/pdf"
				onchange={handleFileSelect}
				style="display: none;"
			/>
		</div>
	{/if}
</div>

<style>
	.pdf-node {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border-radius: 6px;
		overflow: hidden;
	}

	.pdf-node iframe {
		width: 100%;
		height: 100%;
		border: none;
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
