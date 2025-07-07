<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { ArrowRight, Lock } from 'lucide-svelte';
	// Note: Icons not needed since we're using emoji

	// Use $props() rune for component props
	let {
		id,
		content,
		color,
		isSelected,
		isFullscreen,
		isFocused
	}: {
		id: number;
		content: any;
		color: string;
		isSelected: boolean;
		isFullscreen: boolean;
		isFocused: boolean;
	} = $props();

	// Local state for URL input
	let urlInput = $state('');
	let isEditingUrl = $state(false);
	let inputElement = $state<HTMLInputElement>();
	let lastSubmittedUrl = $state(''); // Track last submitted URL for forcing updates

	// Extract URL string regardless of whether content is string or object
	$effect(() => {
		// Re-compute contentStr whenever content changes
		updateContentStr();
	});

	function updateContentStr() {
		const newContentStr =
			content && typeof content === 'object'
				? (content.url ?? content.body ?? content.text ?? '')
				: typeof content === 'string'
					? content
					: '';

		// Update the derived values
		contentStr = newContentStr;
	}

	let contentStr = $state('');

	// Check if we have a valid URL to display
	const hasValidUrl = $derived(contentStr && contentStr.match(/^https?:\/\/.+/));
	const isInitialState = $derived(!contentStr || contentStr.trim() === '');

	// Initialize URL input with current content
	$effect(() => {
		if (hasValidUrl && !isEditingUrl) {
			urlInput = contentStr;
		}
	});

	function handleUrlSubmit() {
		const trimmedUrl = urlInput.trim();
		console.log('[EmbedNode] handleUrlSubmit called, urlInput:', urlInput, 'trimmed:', trimmedUrl); // DEBUG
		if (trimmedUrl) {
			const finalUrl = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
			console.log('[EmbedNode] Submitting URL:', finalUrl); // DEBUG

			// Save last submitted URL for comparison
			lastSubmittedUrl = finalUrl;

			// Update the store
			canvasStore.updateBox(id, { content: { url: finalUrl } });

			// Force immediate update of contentStr without waiting for props to update
			contentStr = finalUrl;

			isEditingUrl = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		console.log('[EmbedNode] handleKeyDown:', event.key); // DEBUG
		if (event.key === 'Enter') {
			event.preventDefault();
			handleUrlSubmit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			isEditingUrl = false;
			urlInput = contentStr || '';
		}
	}

	function startEditing() {
		isEditingUrl = true;
		urlInput = contentStr || '';
		// Focus input after state update
		setTimeout(() => {
			inputElement?.focus();
			inputElement?.select();
		}, 0);
	}

	function getDomainFromUrl(url: string): string {
		try {
			const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
			return urlObj.hostname.replace('www.', '');
		} catch {
			return url;
		}
	}

	$effect(() => {
		if ((isInitialState || isEditingUrl) && inputElement) {
			setTimeout(() => {
				inputElement?.focus();
				inputElement?.select();
			}, 0);
		}
	});
</script>

<div id={String(id)} class="embed-node" style="background-color: black;">
	{#if isInitialState}
		<!-- Initial URL input state -->
		<div class="url-input-container">
			<div class="input-prompt">
				<!-- <div class="flex items-center justify-center p-8">
					<Globe class="h-12 w-12" />
				</div> -->
				<h3>Add Web Embed</h3>
				<p>Enter a URL to embed content</p>
			</div>
			<div class="url-input-wrapper">
				<input
					bind:this={inputElement}
					bind:value={urlInput}
					onkeydown={handleKeyDown}
					placeholder="https://example.com"
					class="url-input initial"
					autocomplete="off"
					spellcheck="false"
					data-cursor="ignore"
				/>
				<button
					onclick={handleUrlSubmit}
					class="submit-btn"
					disabled={!urlInput.trim()}
					aria-label="Embed URL"
				>
					<ArrowRight class="h-4 w-4" />
				</button>
			</div>
			<!-- <div class="hint">Press Enter to load</div> -->
		</div>
	{:else if hasValidUrl}
		<!-- Loaded embed with location bar -->
		<div class="embed-container">
			<!-- Location bar -->
			<div class="location-bar">
				{#if isEditingUrl}
					<input
						bind:this={inputElement}
						bind:value={urlInput}
						onkeydown={handleKeyDown}
						class="url-input editing"
						autocomplete="off"
						spellcheck="false"
						data-cursor="ignore"
					/>
					<!-- <button onclick={handleUrlSubmit} class="submit-btn">✓</button>
					<button onclick={() => (isEditingUrl = false)} class="cancel-btn">✕</button> -->
				{:else}
					<div
						class="url-display"
						onclick={startEditing}
						onkeydown={(e) => e.key === 'Enter' && startEditing()}
						tabindex="0"
						title="Click to edit URL"
					>
						<span class="protocol"><Lock class="mr-2 h-4 w-4" /></span>
						<span class="domain">{getDomainFromUrl(contentStr)}</span>
					</div>
					<!-- <button onclick={startEditing} class="edit-btn" title="Edit URL">⚡</button> -->
				{/if}
			</div>

			<!-- Embedded content -->
			{#key contentStr + lastSubmittedUrl}
				<div class="iframe-container">
					<iframe
						src={contentStr}
						title="Embed {id}"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
						data-cursor={isFocused ? 'ignore' : undefined}
						style="pointer-events: {isFocused ? 'auto' : 'none'};"
					></iframe>
				</div>
			{/key}
		</div>
	{:else}
		<!-- Invalid URL state -->
		<div class="error-container">
			<div class="error-message">
				<h4>Invalid URL</h4>
				<p>Please enter a valid web address</p>
			</div>
			<button onclick={startEditing} class="retry-btn">Try Again</button>
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
		flex-direction: column;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: black;
	}

	/* Initial URL input state */
	.url-input-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 20px;
		text-align: center;
	}

	.input-prompt h3 {
		margin: 0 0 8px 0;
		font-size: 16px;
		font-weight: 600;
		color: white;
		opacity: 0.9;
	}

	.input-prompt p {
		margin: 0 0 20px 0;
		font-size: 12px;
		opacity: 0.7;
		color: white;
	}

	.url-input-wrapper {
		display: flex;
		width: 100%;
		max-width: 300px;
		gap: 8px;
	}

	.url-input {
		flex: 1;
		padding: 10px 12px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: transparent;
		color: white;
		font-size: 14px;
		outline: none;
		transition: all 0.2s ease;
	}

	.url-input:focus {
		border-color: rgba(255, 255, 255, 0.4);
		background: transparent;
	}

	.url-input.initial {
		font-size: 14px;
	}

	.url-input.editing {
		padding: 6px 8px;
		font-size: 12px;
		border-radius: 4px;
	}

	.submit-btn,
	.edit-btn,
	.cancel-btn,
	.retry-btn {
		padding: 10px 12px;
		border: none;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 40px;
	}

	.submit-btn:hover,
	.edit-btn:hover,
	.cancel-btn:hover,
	.retry-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: rgba(255, 255, 255, 0.1);
	}

	.hint {
		margin-top: 12px;
		font-size: 11px;
		opacity: 0.6;
		color: white;
	}

	/* Loaded embed state */
	.embed-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 4px;
	}

	.location-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		background: rgba(0, 0, 0, 0.1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		min-height: 32px;
	}

	.url-display {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s ease;
		font-size: 12px;
		color: white;
		opacity: 0.8;
	}

	.url-display:hover {
		background: rgba(255, 255, 255, 0.1);
		opacity: 1;
	}

	.protocol {
		font-size: 10px;
		opacity: 0.7;
	}

	.domain {
		font-weight: 500;
	}

	.edit-btn {
		padding: 4px 6px;
		font-size: 12px;
		min-width: 24px;
		height: 24px;
	}

	.cancel-btn {
		padding: 4px 6px;
		font-size: 10px;
		min-width: 24px;
		height: 24px;
		background: rgba(255, 100, 100, 0.2);
	}

	.cancel-btn:hover {
		background: rgba(255, 100, 100, 0.3);
	}

	.iframe-container {
		flex: 1;
		position: relative;
		border-radius: 4px;
	}

	.iframe-container iframe {
		width: 100%;
		height: 100%;
		border: none;
		pointer-events: auto;
		border-radius: 4px;
	}

	/* Error state */
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 20px;
		text-align: center;
	}

	.error-message h4 {
		margin: 0 0 8px 0;
		font-size: 14px;
		color: #ff6b6b;
		font-weight: 600;
	}

	.error-message p {
		margin: 0 0 16px 0;
		font-size: 12px;
		opacity: 0.7;
		color: white;
	}

	.retry-btn {
		padding: 8px 16px;
		font-size: 12px;
	}

	.submit-btn {
		margin-left: 8px;
		padding: 6px 18px;
		background: #222;
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.submit-btn:disabled {
		background: #444;
		color: #aaa;
		cursor: not-allowed;
	}
	.submit-btn:not(:disabled):hover {
		background: #444;
	}
</style>
