<script lang="ts">
	import { onMount } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { getTextColorForBackground } from '$lib/utils/colorUtils';
	import { browser } from '$app/environment';

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
		content: string | { title?: string; body?: string };
		color: string;
		isSelected: boolean;
		isFullscreen: boolean;
		isFocused: boolean;
	} = $props();

	// Handle content that might be a string or an object
	let textContent = $state('');
	let useQuillEditor = $state(false);
	let QuillEditor = $state<any>(null);

	$effect(() => {
		if (typeof content === 'string') {
			textContent = content;
		} else if (content && typeof content === 'object') {
			textContent = content.body || content.title || '';
		} else {
			textContent = '';
		}
	});

	// Use $derived rune to calculate text color based on background
	// const contrastingTextColor = $derived(getTextColorForBackground(color));
	const contrastingTextColor = '#181818';

	// Handle content changes from Quill editor
	function handleContentChange(newContent: { delta?: any; text: string }) {
		// Update the canvas store with the new content
		canvasStore.updateBox(id, { content: newContent.text });
	}

	// Handle textarea content changes (fallback)
	function handleTextareaChange(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		canvasStore.updateBox(id, { content: target.value });
	}

	// Try to load Quill editor
	onMount(async () => {
		if (!browser) return;

		try {
			// Dynamically import the QuillEditor component
			const module = await import('../QuillEditor.svelte');
			QuillEditor = module.default;
			useQuillEditor = true;
			console.log('QuillEditor loaded successfully');
		} catch (error) {
			console.warn('Failed to load QuillEditor, using fallback textarea:', error);
			useQuillEditor = false;
		}
	});
</script>

<div id={String(id)} class="sticky-note-content" style="background-color: {color};">
	<div class="editor-container" style="color: {contrastingTextColor};">
		{#if useQuillEditor && QuillEditor}
			<!-- Use Quill Editor when available -->
			<QuillEditor
				content={textContent}
				onContentChange={handleContentChange}
				placeholder="Start writing..."
				{isFocused}
			/>
		{:else}
			<!-- Fallback to simple textarea -->
			<textarea
				bind:value={textContent}
				oninput={handleTextareaChange}
				placeholder="Start writing..."
				class="fallback-textarea"
				style="color: {contrastingTextColor};"
			></textarea>
		{/if}
	</div>
</div>

<style>
	.sticky-note-content {
		width: 100%;
		height: 100%;
		padding: 12px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: visible;
		border-radius: 6px;
		position: relative;
	}

	.editor-container {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-height: 0; /* Important for flex child to shrink */
	}

	.fallback-textarea {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		resize: none;
		font-family: inherit;
		font-size: 13px;
		line-height: 1.5;
		padding: 8px;
		box-sizing: border-box;
		color: inherit;
		width: 100%;
		height: 100%;
	}

	.fallback-textarea::placeholder {
		color: inherit;
		opacity: 0.6;
		font-style: italic;
	}

	/* Override Quill styles to match sticky note theme */
	:global(.sticky-note-content .ql-editor) {
		color: inherit;
		background: transparent;
		border: none;
		padding: 8px;
		font-size: 13px;
		line-height: 1.5;
		font-family: inherit;
	}

	:global(.sticky-note-content .ql-editor.ql-blank::before) {
		color: inherit;
		opacity: 0.6;
		font-style: italic;
	}

	:global(.sticky-note-content .ql-container) {
		border: none;
		background: transparent;
		font-family: inherit;
	}

	:global(.sticky-note-content .ql-toolbar) {
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		backdrop-filter: blur(8px);
	}

	/* Ensure toolbar appears above other elements */
	:global(.sticky-note-content .ql-toolbar.ql-snow) {
		z-index: 1001;
	}
</style>
