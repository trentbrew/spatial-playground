<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import { getTextColorForBackground } from '$lib/utils/colorUtils';

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
		content: string;
		color: string;
		isSelected: boolean;
		isFullscreen: boolean;
		isFocused: boolean;
	} = $props();

	// State for markdown editor
	let isPreviewMode = $state(false);
	let textareaElement = $state<HTMLTextAreaElement>();
	let renderedMarkdown = $state('');

	// Use $derived rune to calculate text color based on background
	const contrastingTextColor = $derived(getTextColorForBackground(color));

	// Configure marked for safety and features
	onMount(() => {
		try {
			marked.setOptions({
				breaks: true,
				gfm: true
			});
			// Only update after marked is configured
			updateRenderedMarkdown();
		} catch (error) {
			console.warn('Failed to configure marked:', error);
			renderedMarkdown = content || '';
		}
	});

	// Update rendered markdown when content changes
	$effect(() => {
		updateRenderedMarkdown();
	});

	function updateRenderedMarkdown() {
		try {
			// Ensure content is a string and not null/undefined
			const safeContent = content || '';

			if (safeContent.trim() === '') {
				renderedMarkdown = '';
				return;
			}

			const parsed = marked.parse(safeContent);
			// Ensure the result is a string and not a Promise
			renderedMarkdown = typeof parsed === 'string' ? parsed : String(parsed);
		} catch (error) {
			console.warn('Markdown parsing error:', error);
			// Fallback to escaped content to prevent HTML injection
			renderedMarkdown = (content || '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		const textarea = event.target as HTMLTextAreaElement;
		const { selectionStart, selectionEnd } = textarea;

		// Toggle preview with Ctrl/Cmd + P
		if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
			event.preventDefault();
			isPreviewMode = !isPreviewMode;
			return;
		}

		// Tab for indentation
		if (event.key === 'Tab') {
			event.preventDefault();
			const start = selectionStart;
			const end = selectionEnd;

			if (event.shiftKey) {
				// Unindent
				const lineStart = content.lastIndexOf('\n', start - 1) + 1;
				if (content.substring(lineStart, lineStart + 2) === '  ') {
					content = content.substring(0, lineStart) + content.substring(lineStart + 2);
					textarea.setSelectionRange(start - 2, end - 2);
				}
			} else {
				// Indent
				content = content.substring(0, start) + '  ' + content.substring(end);
				textarea.setSelectionRange(start + 2, end + 2);
			}
		}

		// Auto-complete markdown syntax
		if (event.key === 'Enter') {
			const lineStart = content.lastIndexOf('\n', selectionStart - 1) + 1;
			const currentLine = content.substring(lineStart, selectionStart);

			// Continue lists
			const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s/);
			if (listMatch) {
				event.preventDefault();
				const indent = listMatch[1];
				const bullet = listMatch[2];
				const newBullet = bullet.match(/\d+/) ? `${parseInt(bullet) + 1}.` : bullet;
				const insertion = `\n${indent}${newBullet} `;
				content =
					content.substring(0, selectionStart) + insertion + content.substring(selectionEnd);
				textarea.setSelectionRange(
					selectionStart + insertion.length,
					selectionStart + insertion.length
				);
			}
		}

		// Auto-detect when switching to preview mode
		// If user types markdown and pauses, briefly show preview
		if (
			content.includes('#') ||
			content.includes('**') ||
			content.includes('*') ||
			content.includes('-')
		) {
			// Auto-preview logic could go here if desired
		}
	}

	// Auto-toggle preview for better UX
	function handleInput() {
		// If we have markdown syntax and user stops typing, show preview briefly
		// This creates a nice "live preview" effect
	}

	function togglePreview() {
		isPreviewMode = !isPreviewMode;
		if (!isPreviewMode) {
			setTimeout(() => textareaElement?.focus(), 0);
		}
	}
</script>

<div id={String(id)} class="sticky-note-content" style="background-color: {color};">
	<!-- Content Area -->
	<div class="content-area">
		{#if isPreviewMode}
			<!-- Markdown Preview -->
			<div
				class="markdown-preview"
				style="color: {contrastingTextColor};"
				onclick={togglePreview}
				onkeydown={(e) => e.key === 'Enter' && togglePreview()}
				role="button"
				tabindex="0"
				title="Click to edit"
				data-cursor={isFocused ? 'ignore' : undefined}
			>
				{#if renderedMarkdown && renderedMarkdown.trim() !== ''}
					{@html renderedMarkdown}
				{:else}
					<span class="empty-placeholder">Click to edit...</span>
				{/if}
			</div>
		{:else}
			<!-- Markdown Editor -->
			<textarea
				bind:this={textareaElement}
				bind:value={content}
				onkeydown={handleKeyDown}
				oninput={handleInput}
				onblur={() => {
					// Auto-preview when losing focus if content has markdown
					if (
						content.includes('#') ||
						content.includes('**') ||
						content.includes('*') ||
						content.includes('-')
					) {
						setTimeout(() => (isPreviewMode = true), 100);
					}
				}}
				onfocus={() => (isPreviewMode = false)}
				placeholder="Write something..."
				style="color: {contrastingTextColor};"
				class="markdown-editor"
				data-cursor={isFocused ? 'ignore' : undefined}
			></textarea>
		{/if}
	</div>
</div>

<style>
	.sticky-note-content {
		width: 100%;
		height: 100%;
		padding: 8px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 6px;
		position: relative;
	}

	.content-area {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.markdown-editor {
		flex: 1;
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
		background: transparent;
		resize: none;
		font-family: inherit;
		font-size: 12px;
		line-height: 1.4;
		padding: 0;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		/* Remove any focus/active highlights */
		caret-color: auto;
	}

	.markdown-editor::placeholder {
		color: inherit;
		opacity: 0.5; /* Ensures full opacity for placeholder text */
	}

	.markdown-preview {
		flex: 1;
		padding: 0;
		overflow-y: auto;
		font-size: 12px;
		line-height: 1.4;
		cursor: pointer;
	}

	/* Markdown Preview Styles */
	.markdown-preview :global(h1) {
		font-size: 16px;
		margin: 8px 0 4px 0;
		font-weight: bold;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
		padding-bottom: 2px;
	}
	.markdown-preview :global(h2) {
		font-size: 14px;
		margin: 6px 0 3px 0;
		font-weight: bold;
	}
	.markdown-preview :global(h3) {
		font-size: 13px;
		margin: 4px 0 2px 0;
		font-weight: bold;
	}
	.markdown-preview :global(p) {
		margin: 4px 0;
	}
	.markdown-preview :global(ul),
	.markdown-preview :global(ol) {
		margin: 4px 0;
		padding-left: 16px;
	}
	.markdown-preview :global(li) {
		margin: 2px 0;
	}
	.markdown-preview :global(code) {
		background: rgba(0, 0, 0, 0.15);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 11px;
		font-family: 'SF Mono', Monaco, monospace;
	}
	.markdown-preview :global(pre) {
		background: rgba(0, 0, 0, 0.15);
		padding: 8px;
		border-radius: 4px;
		overflow-x: auto;
		font-size: 11px;
		margin: 6px 0;
		border-left: 3px solid rgba(255, 255, 255, 0.3);
	}
	.markdown-preview :global(blockquote) {
		border-left: 3px solid rgba(255, 255, 255, 0.4);
		padding-left: 8px;
		margin: 6px 0;
		font-style: italic;
		opacity: 0.9;
	}
	.markdown-preview :global(a) {
		text-decoration: underline;
		opacity: 0.8;
	}
	.markdown-preview :global(strong) {
		font-weight: bold;
	}
	.markdown-preview :global(em) {
		font-style: italic;
	}
	.markdown-preview :global(hr) {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		margin: 8px 0;
	}

	/* Empty state styling */
	.empty-placeholder {
		opacity: 0.5;
		font-style: italic;
	}
</style>
