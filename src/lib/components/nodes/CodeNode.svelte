<script lang="ts">
	import { onMount } from 'svelte';
	import hljs from 'highlight.js';
	// Import specific styles - using a theme that works well with dark backgrounds
	import 'highlight.js/styles/vs2015.css';

	// Use $props() rune for component props
	const {
		id,
		content,
		color,
		isSelected = false,
		isFullscreen = false,
		isFocused = false
	} = $props<{
		id: number;
		content: any;
		color: string;
		isSelected?: boolean;
		isFullscreen?: boolean;
		isFocused?: boolean;
	}>();

	let codeElement: HTMLElement;
	let textareaElement: HTMLTextAreaElement;
	let isEditing = $state(false);

	// Parse content - could be string or object with { code, language }
	const parsedContent = $derived(() => {
		if (typeof content === 'string') {
			return { code: content, language: 'javascript' };
		}
		if (content && typeof content === 'object') {
			return {
				code: content.code || content.body || content.content || '',
				language: content.language || 'javascript'
			};
		}
		return { code: '', language: 'javascript' };
	});

	const codeText = $derived(parsedContent().code);
	const language = $derived(parsedContent().language);

	// Common programming languages for dropdown
	const languages = [
		'javascript',
		'typescript',
		'python',
		'java',
		'c',
		'cpp',
		'csharp',
		'go',
		'rust',
		'php',
		'ruby',
		'swift',
		'kotlin',
		'scala',
		'html',
		'css',
		'sql',
		'json',
		'yaml',
		'xml',
		'markdown',
		'bash',
		'shell',
		'powershell',
		'dockerfile',
		'nginx'
	];

	// Update syntax highlighting when content changes
	$effect(() => {
		if (codeElement && codeText) {
			updateHighlighting();
		}
	});

	function updateHighlighting() {
		if (!codeElement) return;

		try {
			// Clear previous highlighting
			codeElement.removeAttribute('data-highlighted');

			if (language && hljs.getLanguage(language)) {
				const result = hljs.highlight(codeText, { language });
				codeElement.innerHTML = result.value;
			} else {
				// Auto-detect or fallback
				const result = hljs.highlightAuto(codeText);
				codeElement.innerHTML = result.value;
			}
		} catch (error) {
			console.warn('Syntax highlighting failed:', error);
			codeElement.textContent = codeText;
		}
	}

	function startEditing() {
		isEditing = true;
		// Focus the textarea after DOM update
		setTimeout(() => {
			if (textareaElement) {
				textareaElement.focus();
				textareaElement.setSelectionRange(codeText.length, codeText.length);
			}
		}, 0);
	}

	function stopEditing() {
		isEditing = false;
	}

	function handleCodeChange(event: Event) {
		const textarea = event.target as HTMLTextAreaElement;
		updateContent(textarea.value, language);
	}

	function handleLanguageChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		updateContent(codeText, select.value);
	}

	function updateContent(newCode: string, newLanguage: string) {
		// Dispatch update to parent through store
		import('$lib/stores/canvasStore.svelte').then((module) => {
			module.canvasStore.updateBox(id, {
				content: {
					code: newCode,
					language: newLanguage
				} as any
			});
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			stopEditing();
		} else if (event.key === 'Tab') {
			// Insert tab character instead of moving focus
			event.preventDefault();
			const textarea = event.target as HTMLTextAreaElement;
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;

			// Insert tab
			const value = textarea.value;
			textarea.value = value.substring(0, start) + '\t' + value.substring(end);

			// Restore cursor position
			textarea.selectionStart = textarea.selectionEnd = start + 1;

			// Update content
			handleCodeChange(event);
		}
	}

	onMount(() => {
		updateHighlighting();
	});
</script>

<div class="code-node" style:background-color={color}>
	<!-- Language selector -->
	<div class="code-header">
		<select
			class="language-select"
			value={language}
			onchange={handleLanguageChange}
			onclick={(e) => e.stopPropagation()}
		>
			{#each languages as lang}
				<option value={lang}>{lang.toUpperCase()}</option>
			{/each}
		</select>
		<button
			class="edit-button"
			onclick={(e) => {
				e.stopPropagation();
				startEditing();
			}}
			title="Edit code"
		>
			✏️
		</button>
	</div>

	<!-- Code display/editor -->
	<div class="code-container">
		{#if isEditing}
			<textarea
				bind:this={textareaElement}
				class="code-editor"
				value={codeText}
				oninput={handleCodeChange}
				onkeydown={handleKeyDown}
				onblur={stopEditing}
				onclick={(e) => e.stopPropagation()}
				placeholder="Enter your code here..."
			></textarea>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<pre class="code-display" onclick={startEditing} tabindex="0"><code
					bind:this={codeElement}
					class="hljs language-{language}"></code></pre>
		{/if}
	</div>

	{#if !codeText}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="code-placeholder" onclick={startEditing} role="button" tabindex="0">
			Click to add code...
		</div>
	{/if}
</div>

<style>
	.code-node {
		width: 100%;
		height: 100%;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		font-family:
			'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
		position: relative;
		overflow: hidden;
	}

	.code-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		gap: 8px;
	}

	.language-select {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		color: white;
		padding: 4px 8px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
		cursor: pointer;
	}

	.language-select option {
		background: #2a2a2a;
		color: white;
	}

	.edit-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 14px;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.edit-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.code-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}

	.code-display {
		flex: 1;
		margin: 0;
		padding: 12px;
		background: transparent;
		overflow: auto;
		cursor: text;
		font-size: 13px;
		line-height: 1.4;
	}

	.code-display code {
		background: transparent !important;
		padding: 0 !important;
		font-family: inherit;
	}

	.code-editor {
		flex: 1;
		background: rgba(0, 0, 0, 0.3);
		border: none;
		color: white;
		padding: 12px;
		font-family: inherit;
		font-size: 13px;
		line-height: 1.4;
		resize: none;
		outline: none;
		tab-size: 2;
	}

	.code-editor::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}

	.code-placeholder {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		font-size: 14px;
		text-align: center;
		padding: 20px;
	}

	/* Custom scrollbar for code areas */
	.code-display::-webkit-scrollbar,
	.code-editor::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.code-display::-webkit-scrollbar-track,
	.code-editor::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	.code-display::-webkit-scrollbar-thumb,
	.code-editor::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
		border-radius: 3px;
	}

	.code-display::-webkit-scrollbar-thumb:hover,
	.code-editor::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.5);
	}

	/* Ensure code highlighting styles work well */
	:global(.code-node .hljs) {
		background: transparent !important;
		color: inherit !important;
	}

	/* Override some highlight.js theme colors for better contrast */
	:global(.code-node .hljs-keyword) {
		color: #ff79c6 !important;
	}

	:global(.code-node .hljs-string) {
		color: #f1fa8c !important;
	}

	:global(.code-node .hljs-comment) {
		color: #6272a4 !important;
	}

	:global(.code-node .hljs-number) {
		color: #bd93f9 !important;
	}

	:global(.code-node .hljs-function) {
		color: #50fa7b !important;
	}
</style>
