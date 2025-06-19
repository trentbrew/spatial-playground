<script lang="ts">
	import { onMount } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { getTextColorForBackground } from '$lib/utils/colorUtils';
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';

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

	// Color palette state
	let showColorPalette = $state(false);
	const PRESET_COLORS = [
		'#212121',
		'#616161',
		'#f44336',
		'#e91e63',
		'#9c27b0',
		'#673ab7',
		'#3f51b5',
		'#2196f3',
		'#03a9f4',
		'#00bcd4',
		'#009688',
		'#4caf50',
		'#8bc34a',
		'#cddc39',
		'#ffeb3b',
		'#ffc107',
		'#ff9800',
		'#795548'
	];

	function handleColorSelect(newColor: string) {
		const foregroundColor = getTextColorForBackground(newColor);
		canvasStore.updateBox(id, { color: newColor, foregroundColor });
		showColorPalette = false; // Hide palette after selection
	}

	// Handle content that might be a string or an object
	let textContent = $state('');
	let useQuillEditor = $state(false);
	let QuillEditor = $state<any>(null);

	$effect(() => {
		if (typeof content === 'string') {
			textContent = content;
		} else if (content && typeof content === 'object') {
			// Handle complex content object
			textContent = content.body || '';
		}
	});

	$effect(() => {
		if (browser) {
			import('../QuillEditor.svelte').then((module) => {
				QuillEditor = module.default;
				useQuillEditor = true;
			});
		}
	});

	// Use a static text color for better readability with custom backgrounds
	const contrastingTextColor = '#181818';

	// Handle content changes from Quill editor
	function handleContentChange(event: CustomEvent<{ text: string; delta: any }>) {
		const newText = event.detail.text;
		canvasStore.updateBox(id, { content: newText });
	}

	// Handle content changes from fallback textarea
	function handleTextareaChange(event: Event) {
		const newText = (event.target as HTMLTextAreaElement).value;
		canvasStore.updateBox(id, { content: newText });
	}

	function handleSwatchHover(isHovering: boolean) {
		if (browser) {
			document.body.classList.toggle('hovering-color-swatch', isHovering);
		}
	}
</script>

<div class="sticky-note-container" style:background-color={color}>
	<div class="sticky-note-content">
		<div class="editor-container">
			{#if useQuillEditor && QuillEditor}
				<!-- Use Quill Editor when available -->
				<QuillEditor
					{content}
					{isFocused}
					showColorButton={true}
					on:colorpick={() => (showColorPalette = !showColorPalette)}
					onContentChange={handleContentChange}
					placeholder="Start writing..."
					foregroundColor={color && box.foregroundColor
						? box.foregroundColor
						: getTextColorForBackground(color)}
				/>
			{:else}
				<!-- Fallback for SSR or if Quill fails -->
				<textarea
					bind:value={textContent}
					oninput={handleTextareaChange}
					placeholder="Start writing..."
					class="fallback-textarea"
					style:color={contrastingTextColor}
				></textarea>
			{/if}
		</div>

		{#if showColorPalette && isFocused}
			<div class="color-palette-wrapper" transition:fade={{ duration: 150 }}>
				<div class="color-palette">
					{#each PRESET_COLORS as presetColor}
						<button
							class="color-swatch"
							style:background-color={presetColor}
							aria-label="Set color to {presetColor}"
							onclick={() => handleColorSelect(presetColor)}
							onmouseover={() => handleSwatchHover(true)}
							onmouseout={() => handleSwatchHover(false)}
						>
							{#if presetColor === color}
								<div class="selected-indicator" />
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.sticky-note-container {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: 8px;
		transition: background-color 0.2s;
		position: relative;
	}

	.sticky-note-content {
		width: 100%;
		height: 100%;
		padding: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: visible; /* Allow toolbar to show outside */
		border-radius: 6px;
		position: relative;
	}

	.editor-container {
		flex-grow: 1;
		width: 100%;
		position: relative;
		border-radius: 6px;
		overflow: hidden; /* Clip the editor content but not the wrapper */
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.fallback-textarea {
		width: 100%;
		height: 100%;
		padding: 12px;
		box-sizing: border-box;
		border: none;
		outline: none;
		resize: none;
		background-color: transparent;
		font-family: inherit;
		font-size: 14px;
	}

	.color-palette-wrapper {
		position: absolute;
		bottom: -100px; /* Position it below the toolbar */
		left: 50%;
		transform: translateX(-50%);
		z-index: 110; /* Above the toolbar */
		background: #2a2a2e;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		padding: 8px;
	}

	.color-palette {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 6px;
	}

	.color-swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		cursor: pointer;
		transition: transform 0.1s ease-out;
		position: relative;
	}

	.color-swatch:hover {
		transform: scale(1.1);
	}

	.selected-indicator {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: white;
		border: 2px solid #2a2a2e;
		box-shadow: 0 0 0 1px white;
	}
</style>
