<script>
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';

	export let content = '';
	export let onContentChange = (newContent) => {};
	export let placeholder = 'Start writing...';
	export let isFocused = false;
	export let showColorButton = false;
	export let foregroundColor = '#181818';

	const dispatch = createEventDispatcher();

	let quill = null;
	let editorContainer;
	let isInitialized = false;
	let isQuillLoaded = false;
	let initError = null;
	let hasTextSelection = false;

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

			// Base toolbar options
			const toolbarItems = [
				['bold', 'italic'],
				[{ list: 'ordered' }, { list: 'bullet' }],
				[{ header: '1' }],
				['link', 'image']
			];

			// Custom handlers
			const handlers = {};

			// Conditionally add the color picker button
			if (showColorButton) {
				toolbarItems.push(['color-picker']);
				handlers['color-picker'] = () => {
					dispatch('colorpick');
				};
			}

			const options = {
				modules: {
					history: {
						delay: 1000,
						maxStack: 50,
						userOnly: false
					},
					toolbar: {
						container: toolbarItems,
						handlers: handlers
					}
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

			// Handle selection changes to track if text is selected
			quill.on('selection-change', (range) => {
				try {
					// hasTextSelection is true when there's a range with length > 0
					// When clicking elsewhere or losing focus, range becomes null
					hasTextSelection = range && range.length > 0;
				} catch (error) {
					console.warn('Error handling selection change:', error);
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

	// Handle fallback textarea selection changes
	function handleFallbackSelection(event) {
		const textarea = event.target;
		hasTextSelection = textarea.selectionStart !== textarea.selectionEnd;
	}

	// Handle fallback textarea focus loss
	function handleFallbackBlur() {
		hasTextSelection = false;
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

<div
	class="editor-wrapper"
	class:focused={isFocused}
	class:has-selection={hasTextSelection}
	style="--foreground-color: {foregroundColor}"
>
	{#if !browser || initError}
		<!-- Fallback textarea for SSR or error states -->
		<textarea
			bind:this={fallbackTextarea}
			bind:value={fallbackContent}
			on:input={handleFallbackInput}
			on:select={handleFallbackSelection}
			on:mouseup={handleFallbackSelection}
			on:keyup={handleFallbackSelection}
			on:blur={handleFallbackBlur}
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
		padding: 4px;
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
		width: 100%;
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
		color: var(--foreground-color, #181818) !important;
		text-align: left;
		overflow-y: auto;
		max-height: 100%;
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

	/* --- Toolbar docked at bottom, absolutely positioned and centered --- */
	:global(.quill-wrapper .ql-toolbar) {
		position: absolute;
		bottom: 0px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		width: 100%;
		max-width: none;
		justify-content: center;
		z-index: 100;
		border: none !important;
		border-radius: 8px;
		/* border-top: 1px solid rgba(255, 255, 255, 0.1) !important; */
		background: rgba(0, 0, 0, 0) !important;
		padding: 16px 0px 16px 0px !important;
		border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.2s ease-out,
			visibility 0.2s ease-out,
			transform 0.2s ease-out;
		color: var(--foreground-color, #181818) !important;
	}

	:global(.focused.has-selection .ql-toolbar) {
		opacity: 1;
		visibility: visible;
		background: rgba(0, 0, 0, 1) !important;
		box-shadow: none !important;
	}

	/* Custom Color Picker Button Icon */
	:global(.ql-toolbar .ql-color-picker) {
		width: 28px;
		position: relative;
	}

	/* Hide Quill's default icon content */
	:global(.ql-toolbar .ql-color-picker svg) {
		display: none;
	}

	/* Draw our custom icon using a pseudo-element */
	:global(.ql-toolbar .ql-color-picker::before) {
		content: '';
		display: block;
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 20px;
		height: 20px;
		background-image: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 16C6.80222 16 6.60888 16.0586 6.44443 16.1685C6.27998 16.2784 6.15181 16.4346 6.07612 16.6173C6.00043 16.8 5.98063 17.0011 6.01921 17.1951C6.0578 17.3891 6.15304 17.5673 6.29289 17.7071C6.43275 17.847 6.61093 17.9422 6.80491 17.9808C6.99889 18.0194 7.19996 17.9996 7.38268 17.9239C7.56541 17.8482 7.72159 17.72 7.83147 17.5556C7.94135 17.3911 8 17.1978 8 17C8 16.7348 7.89464 16.4804 7.70711 16.2929C7.51957 16.1054 7.26522 16 7 16ZM19.06 12L20.29 10.77C20.8518 10.2075 21.1674 9.445 21.1674 8.65C21.1674 7.855 20.8518 7.0925 20.29 6.53L17.46 3.71C16.8975 3.1482 16.135 2.83264 15.34 2.83264C14.545 2.83264 13.7825 3.1482 13.22 3.71L12 4.94C11.9843 4.15479 11.6613 3.40706 11.1004 2.85736C10.5395 2.30766 9.78536 1.99984 9 2H5C4.20435 2 3.44129 2.31607 2.87868 2.87868C2.31607 3.44129 2 4.20435 2 5V19C2 19.7956 2.31607 20.5587 2.87868 21.1213C3.44129 21.6839 4.20435 22 5 22H19C19.7956 22 20.5587 21.6839 21.1213 21.1213C21.6839 20.5587 22 19.7956 22 19V15C22.0002 14.2146 21.6923 13.4605 21.1426 12.8996C20.5929 12.3387 19.8452 12.0157 19.06 12ZM10 19C10 19.2652 9.89464 19.5196 9.70711 19.7071C9.51957 19.8946 9.26522 20 9 20H5C4.73478 20 4.48043 19.8946 4.29289 19.7071C4.10536 19.5196 4 19.2652 4 19V5C4 4.73478 4.10536 4.48043 4.29289 4.29289C4.48043 4.10536 4.73478 4 5 4H9C9.26522 4 9.51957 4.10536 9.70711 4.29289C9.89464 4.48043 10 4.73478 10 5V19ZM12 7.76L14.64 5.12C14.8274 4.93375 15.0808 4.82921 15.345 4.82921C15.6092 4.82921 15.8626 4.93375 16.05 5.12L18.88 8C19.0663 8.18736 19.1708 8.44081 19.1708 8.705C19.1708 8.96919 19.0663 9.22264 18.88 9.41L16 12.29L12 16.24V7.76ZM20 19C20 19.2652 19.8946 19.5196 19.7071 19.7071C19.5196 19.8946 19.2652 20 19 20H11.82C11.9226 19.7036 11.9799 19.3935 11.99 19.08L17.07 14H19C19.2652 14 19.5196 14.1054 19.7071 14.2929C19.8946 14.4804 20 14.7348 20 15V19Z" fill="%23c2c2c9"/></svg>');
		background-size: contain;
		background-repeat: no-repeat;
		filter: var(--foreground-color === '#FFFFFF' ? 'invert(1)': 'none');
	}

	:global(.quill-wrapper .ql-snow .ql-stroke) {
		stroke: #c2c2c9 !important;
	}

	:global(.quill-wrapper .ql-snow .ql-fill) {
		fill: #c2c2c9 !important;
	}

	:global(.quill-wrapper .ql-snow .ql-picker-label) {
		color: var(--foreground-color, #181818) !important;
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
		min-width: 100%;
		line-height: 1.5;
		text-align: left;
		overflow-y: auto;
		max-height: 100%;
		color: var(--foreground-color, #181818) !important;
	}

	:global(.ql-editor.ql-blank::before) {
		font-style: italic;
		color: #999;
	}
</style>
