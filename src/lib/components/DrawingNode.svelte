<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		id: string;
		content?: {
			drawingData?: string;
			excalidrawUrl?: string;
		};
		onContentChange?: (content: any) => void;
	}

	let { id, content = {}, onContentChange }: Props = $props();

	let iframeElement: HTMLIFrameElement;
	let isLoaded = $state(false);

	function generateEncryptionKey() {
		// 16 bytes = 128 bits = 22 base64url chars (no padding)
		const array = new Uint8Array(16);
		if (typeof window !== 'undefined' && window.crypto) {
			window.crypto.getRandomValues(array);
		} else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
			crypto.getRandomValues(array);
		} else {
			// fallback (not cryptographically secure)
			for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
		}
		return btoa(String.fromCharCode(...array))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	const encryptionKey = content.excalidrawUrl ? undefined : generateEncryptionKey();

	const excalidrawUrl =
		content.excalidrawUrl || `https://excalidraw.com/#room=${id},${encryptionKey}`;

	function handleIframeLoad() {
		isLoaded = true;
		// Save the URL so we can return to the same drawing
		if (onContentChange && !content.excalidrawUrl) {
			onContentChange({
				...content,
				excalidrawUrl
			});
		}
	}

	function openInNewTab() {
		window.open(excalidrawUrl, '_blank');
	}
</script>

<div class="drawing-node">
	<div class="drawing-header">
		<h3>Drawing Canvas</h3>
		<button class="open-external-btn" onclick={openInNewTab} title="Open in new tab"> ↗ </button>
	</div>

	<div class="drawing-container">
		{#if !isLoaded}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading Excalidraw...</p>
			</div>
		{/if}

		<iframe
			bind:this={iframeElement}
			src={excalidrawUrl}
			title="Excalidraw Drawing Canvas"
			class="drawing-iframe"
			class:loaded={isLoaded}
			onload={handleIframeLoad}
			allow="clipboard-read; clipboard-write"
			sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups"
		></iframe>
	</div>
</div>

<style>
	.drawing-node {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: white;
		border-radius: 8px;
		overflow: hidden;
	}

	.drawing-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: #f8f9fa;
		border-bottom: 1px solid #e9ecef;
	}

	.drawing-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #495057;
	}

	.open-external-btn {
		background: none;
		border: none;
		font-size: 16px;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		color: #6c757d;
		transition: all 0.2s ease;
	}

	.open-external-btn:hover {
		background: #e9ecef;
		color: #495057;
	}

	.drawing-container {
		flex: 1;
		position: relative;
		min-height: 400px;
	}

	.loading-state {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: white;
		z-index: 2;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #f3f3f3;
		border-top: 3px solid #6366f1;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 12px;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.loading-state p {
		margin: 0;
		color: #6c757d;
		font-size: 14px;
	}

	.drawing-iframe {
		width: 100%;
		height: 100%;
		border: none;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.drawing-iframe.loaded {
		opacity: 1;
	}
</style>
