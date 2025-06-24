<script lang="ts">
	import { onMount } from 'svelte';

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

	let AceEditorComponent: any = null;
	let aceEditor: any;
	let isReadOnly = $state(true);
	let isLoaded = $state(false);
	let isBrowser = $state(false);

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

	// Language mapping for ace editor modes
	const languageMap: Record<string, string> = {
		javascript: 'javascript',
		typescript: 'typescript',
		python: 'python',
		java: 'java',
		c: 'c_cpp',
		cpp: 'c_cpp',
		csharp: 'csharp',
		go: 'golang',
		rust: 'rust',
		php: 'php',
		ruby: 'ruby',
		swift: 'swift',
		kotlin: 'java', // Use java mode for kotlin
		scala: 'scala',
		html: 'html',
		css: 'css',
		sql: 'sql',
		json: 'json',
		yaml: 'yaml',
		xml: 'xml',
		markdown: 'markdown',
		bash: 'sh',
		shell: 'sh',
		powershell: 'powershell',
		dockerfile: 'dockerfile',
		nginx: 'text' // fallback to text mode
	};

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

	// Get ace mode for language
	const aceMode = $derived(languageMap[language] || 'text');

	// Dynamic import function for ace editor modules
	async function loadAceModules() {
		if (!isBrowser) return;

		try {
			// Import AceEditor component
			const { AceEditor } = await import('svelte-ace');
			AceEditorComponent = AceEditor;

			// Import required modes and themes
			await Promise.all([
				import('brace/mode/javascript'),
				import('brace/mode/typescript'),
				import('brace/mode/python'),
				import('brace/mode/java'),
				import('brace/mode/c_cpp'),
				import('brace/mode/csharp'),
				import('brace/mode/golang'),
				import('brace/mode/rust'),
				import('brace/mode/php'),
				import('brace/mode/ruby'),
				import('brace/mode/swift'),
				import('brace/mode/scala'),
				import('brace/mode/html'),
				import('brace/mode/css'),
				import('brace/mode/sql'),
				import('brace/mode/json'),
				import('brace/mode/yaml'),
				import('brace/mode/xml'),
				import('brace/mode/markdown'),
				import('brace/mode/sh'),
				import('brace/mode/powershell'),
				import('brace/mode/dockerfile'),
				import('brace/mode/text'),
				import('brace/theme/monokai'),
				import('brace/theme/github'),
				import('brace/theme/tomorrow_night'),
				import('brace/theme/dracula'),
				import('brace/theme/twilight')
			]);

			isLoaded = true;
		} catch (error) {
			console.error('Failed to load Ace Editor:', error);
		}
	}

	function toggleReadOnly() {
		isReadOnly = !isReadOnly;
		if (aceEditor) {
			aceEditor.setReadOnly(isReadOnly);
			if (!isReadOnly) {
				aceEditor.focus();
			}
		}
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

	function handleEditorInput(event: CustomEvent) {
		const newCode = event.detail;
		updateContent(newCode, language);
	}

	function handleEditorInit(event: CustomEvent) {
		aceEditor = event.detail;
		aceEditor.setReadOnly(isReadOnly);

		// Configure editor
		aceEditor.setOptions({
			fontSize: 13,
			showPrintMargin: false,
			wrap: true,
			enableBasicAutocompletion: true,
			enableLiveAutocompletion: true,
			enableSnippets: true,
			tabSize: 2,
			useSoftTabs: true
		});
	}

	function handleKeyCommand(event: CustomEvent) {
		const command = event.detail;
		if (command === 'Escape') {
			if (!isReadOnly) {
				toggleReadOnly();
			}
		}
	}

	function handleFallbackInput(event: Event) {
		const textarea = event.target as HTMLTextAreaElement;
		updateContent(textarea.value, language);
	}

	// Load ace modules when component mounts
	onMount(() => {
		isBrowser = typeof window !== 'undefined';
		if (isBrowser) {
			loadAceModules();
		}
	});
</script>

<div class="code-node" style:background-color={color}>
	<!-- Header with controls -->
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

		<div class="header-controls">
			<button
				class="control-button"
				onclick={(e) => {
					e.stopPropagation();
					toggleReadOnly();
				}}
				title={isReadOnly ? 'Edit code' : 'Stop editing'}
			>
				Run
			</button>
		</div>
	</div>

	<!-- Ace Editor Container -->
	<div class="editor-container">
		{#if isBrowser && isLoaded && AceEditorComponent}
			<svelte:component
				this={AceEditorComponent}
				on:input={handleEditorInput}
				on:init={handleEditorInit}
				on:commandKey={handleKeyCommand}
				width="100%"
				height="100%"
				lang={aceMode}
				theme="monokai"
				value={codeText}
				options={{
					readOnly: isReadOnly,
					highlightActiveLine: !isReadOnly,
					highlightGutterLine: !isReadOnly,
					showCursor: !isReadOnly
				}}
			/>
		{:else}
			<!-- Fallback loading state or simple textarea -->
			<div class="loading-container">
				{#if !isBrowser}
					<div class="loading-message">Initializing...</div>
				{:else if !isLoaded}
					<div class="loading-message">Loading editor...</div>
				{:else}
					<!-- Simple textarea fallback for SSR or if ace fails to load -->
					<textarea
						class="fallback-editor"
						value={codeText}
						oninput={handleFallbackInput}
						onclick={(e) => e.stopPropagation()}
						placeholder="Enter your code here..."
					></textarea>
				{/if}
			</div>
		{/if}
	</div>

	{#if !codeText}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="code-placeholder" onclick={toggleReadOnly} role="button" tabindex="0">
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
		background: #2d2d2d;
	}

	.code-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		gap: 8px;
		min-height: 40px;
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

	.header-controls {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.control-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 14px;
		padding: 4px 6px;
		border-radius: 4px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 24px;
	}

	.control-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.editor-container {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.loading-container {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.1);
	}

	.loading-message {
		color: rgba(255, 255, 255, 0.6);
		font-size: 14px;
	}

	.fallback-editor {
		width: 100%;
		height: 100%;
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

	.fallback-editor::placeholder {
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
		z-index: 10;
	}

	/* Override Ace Editor styles to match our theme */
	:global(.code-node .ace_editor) {
		font-family:
			'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
		background: transparent !important;
	}

	:global(.code-node .ace_gutter) {
		background: rgba(0, 0, 0, 0.2) !important;
		border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
	}

	:global(.code-node .ace_scroller) {
		background: transparent !important;
	}

	:global(.code-node .ace_content) {
		background: transparent !important;
	}

	/* Custom scrollbar for ace editor */
	:global(.code-node .ace_scrollbar-v) {
		width: 6px !important;
	}

	:global(.code-node .ace_scrollbar-h) {
		height: 6px !important;
	}

	/* Custom scrollbar for fallback editor */
	.fallback-editor::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.fallback-editor::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	.fallback-editor::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
		border-radius: 3px;
	}

	.fallback-editor::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.5);
	}
</style>
