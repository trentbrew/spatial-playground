<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	export let content = '';
	export let onContentChange = (newContent) => {};
	export let placeholder = 'Start writing...';
	export let isFocused = false;

	let quill = null;
	let editorContainer;
	let isInitialized = false;
	let isQuillLoaded = false;
	let initError = null;

	// Fallback textarea for SSR and error states
	let fallbackTextarea;
	let fallbackContent = '';

	// Initialize fallback content
	$: {
		if (typeof content === 'string') {
			fallbackContent = content;
		} else if (content && typeof content === 'object') {
			fallbackContent = content.text || content.body || '';
		}
	}

	// Handle content changes from parent (only after Quill is loaded)
	$: {
		if (quill && content && !isInitialized && isQuillLoaded) {
			try {
				if (typeof content === 'string') {
					quill.setText(content);
				} else if (content && content.text) {
					quill.setText(content.text);
				}
				isInitialized = true;
			} catch (error) {
				console.warn('Error setting content:', error);
			}
		}
	}

	async function initQuill() {
		if (!browser || !editorContainer) {
			console.log('Quill init skipped: browser or container not available');
			return;
		}

		try {
			// Dynamic imports for client-side only
			const [QuillModule, QuillMarkdownModule] = await Promise.all([
				import('quill').catch((err) => {
					console.warn('Failed to load Quill:', err);
					return null;
				}),
				import('quilljs-markdown').catch((err) => {
					console.warn('Failed to load QuillMarkdown:', err);
					return null;
				})
			]);

			if (!QuillModule || !QuillModule.default) {
				throw new Error('Failed to load Quill module');
			}

			const Quill = QuillModule.default;

			const options = {
				modules: {
					history: {
						delay: 1000,
						maxStack: 50,
						userOnly: false
					},
					toolbar: [
						['bold', 'italic'],
						[{ list: 'ordered' }, { list: 'bullet' }],
						[{ header: '1' }],
						['link', 'image']
					]
				},
				placeholder: placeholder,
				theme: 'snow'
			};

			quill = new Quill(editorContainer, options);

			// Initialize markdown support if available
			if (QuillMarkdownModule && QuillMarkdownModule.default) {
				try {
					const QuillMarkdown = QuillMarkdownModule.default;
					new QuillMarkdown(quill, {});
				} catch (mdError) {
					console.warn('Failed to initialize markdown support:', mdError);
				}
			}

			// Set initial content if provided
			if (fallbackContent) {
				quill.setText(fallbackContent);
				isInitialized = true;
			}

			// Handle content changes
			quill.on('text-change', () => {
				try {
					const delta = quill.getContents();
					const text = quill.getText();
					onContentChange({ delta, text });
				} catch (error) {
					console.warn('Error handling text change:', error);
				}
			});

			isQuillLoaded = true;
		} catch (error) {
			console.error('Error initializing Quill:', error);
			initError = error.message;
			isQuillLoaded = false;
		}
	}

	// Handle fallback textarea changes
	function handleFallbackInput(event) {
		const text = event.target.value;
		onContentChange({ text, delta: null });
	}

	onMount(() => {
		if (browser) {
			// Add a small delay to ensure DOM is ready
			setTimeout(() => {
				initQuill();
			}, 100);
		}
	});

	onDestroy(() => {
		try {
			if (quill) {
				// Get the toolbar element before destroying Quill
				const toolbarEl = quill.getModule('toolbar')?.container;
				if (toolbarEl && toolbarEl.parentNode) {
					toolbarEl.parentNode.removeChild(toolbarEl);
				}

				// Unbind all event listeners
				quill.off('text-change');
				quill.off('selection-change');
				quill = null;
			}
			if (editorContainer) {
				// Clear any remaining inner HTML just in case
				editorContainer.innerHTML = '';
			}
			console.log('Quill editor cleaned up successfully');
		} catch (error) {
			console.warn('Error during Quill cleanup:', error);
		}
	});
</script>

<svelte:head>
	{#if browser}
		<link href="//cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet" />
	{/if}
</svelte:head>

<div class="editor-wrapper" class:focused={isFocused}>
	{#if !browser || initError}
		<!-- Fallback textarea for SSR or error states -->
		<textarea
			bind:this={fallbackTextarea}
			bind:value={fallbackContent}
			on:input={handleFallbackInput}
			{placeholder}
			class="fallback-editor"
		></textarea>
		{#if initError}
			<div class="error-message">
				Editor failed to load: {initError}
			</div>
		{/if}
	{:else}
		<!-- Quill editor container -->
		<div class="quill-wrapper" style="height: 100%;">
			<div bind:this={editorContainer} class="quill-editor-container"></div>
		</div>
		{#if !isQuillLoaded}
			<div class="loading-message">Loading editor...</div>
		{/if}
	{/if}
</div>

<style>
	.editor-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: visible; /* Allow toolbar to show outside */
	}

	.quill-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.quill-editor-container {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.fallback-editor {
		width: 100%;
		height: 100%;
		border: none;
		outline: none;
		background: transparent;
		resize: none;
		font-family: inherit;
		font-size: 13px;
		line-height: 1.5;
		padding: 12px;
		box-sizing: border-box;
		color: inherit;
	}

	.fallback-editor::placeholder {
		color: inherit;
		opacity: 0.6;
		font-style: italic;
	}

	.loading-message,
	.error-message {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 12px;
		opacity: 0.6;
		pointer-events: none;
	}

	.error-message {
		color: #ff4444;
	}

	/* --- Toolbar docked at bottom --- */
	:global(.quill-wrapper .ql-toolbar) {
		position: absolute;
		bottom: -52px; /* Position it below the node */
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		z-index: 100;
		border: none !important;
		border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
		background: #212121 !important;
		padding: 8px 12px !important;
		border-radius: 8px;
		opacity: 0;
		visibility: hidden;
		transform: translateY(-55px) scale(0.9);
		transition:
			opacity 0.2s ease-out,
			visibility 0.2s ease-out,
			transform 0.2s ease-out;
	}

	:global(.focused .ql-toolbar) {
		opacity: 1;
		visibility: visible;
		transform: translateY(-55px) scale(1);
		background: #212121 !important;
		/* filter: invert(1) !important; */
		box-shadow: none !important;
	}

	:global(.quill-wrapper .ql-snow .ql-stroke) {
		stroke: #c2c2c9 !important;
	}

	:global(.quill-wrapper .ql-snow .ql-fill) {
		fill: #c2c2c9 !important;
	}

	:global(.quill-wrapper .ql-snow .ql-picker-label) {
		color: #c2c2c9 !important;
	}

	/* --- Editor container fills remaining space --- */
	:global(.quill-wrapper .ql-container) {
		height: 100%; /* Ensure it fills the node */
		border: none !important;
		font-size: 14px;
		font-family: inherit;
		overflow-y: auto;
		background: transparent; /* Ensure editor background is transparent */
	}

	:global(.ql-editor) {
		padding: 12px;
		height: 100%;
		line-height: 1.5;
	}

	:global(.ql-editor.ql-blank::before) {
		font-style: italic;
		color: #999;
	}
</style>
