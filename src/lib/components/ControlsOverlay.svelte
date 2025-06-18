<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import ThemeToggle from './ThemeToggle.svelte'; // Assuming this exists

	// Direct access to store properties (reactive)
	const selectedBoxId = $derived(canvasStore.selectedBoxId);
	const boxes = $derived(canvasStore.boxes);
	const selectedBox = $derived(boxes.find((box) => box.id === selectedBoxId));

	// Viewport state for display
	const currentZoom = $derived(canvasStore.zoom);
	const currentOffsetX = $derived(canvasStore.offsetX);
	const currentOffsetY = $derived(canvasStore.offsetY);

	// Input values, synced one-way from selected box
	let debugXInput = $state('');
	let debugYInput = $state('');
	let debugWidthInput = $state('');
	let debugHeightInput = $state('');

	// Update input fields when selected box changes
	$effect(() => {
		if (selectedBox) {
			debugXInput = selectedBox.x.toFixed(1);
			debugYInput = selectedBox.y.toFixed(1);
			debugWidthInput = selectedBox.width.toFixed(1);
			debugHeightInput = selectedBox.height.toFixed(1);
		} else {
			// Clear inputs if no box is selected
			debugXInput = '';
			debugYInput = '';
			debugWidthInput = '';
			debugHeightInput = '';
		}
	});

	// Function to handle input changes and update the store
	// Debounce this in a real app to prevent excessive updates
	function handleDebugInput(field: keyof AppBoxState, value: string) {
		if (selectedBoxId === null) return;
		const numValue = parseFloat(value);
		if (isNaN(numValue)) return; // Ignore invalid numbers

		// Create update object with correct type inference
		const update: Partial<Pick<AppBoxState, keyof AppBoxState>> = {
			[field]: numValue
		};

		canvasStore.updateBox(selectedBoxId, update);
	}

	function handleAddBox() {
		// TODO: Implement addBox logic similar to legacy or refine
		console.log('Add box clicked - Placeholder');
	}

	function handleRegenerateScene() {
		canvasStore.regenerateScene();
	}

	// Zoom slider state and handlers
	let zoomSliderValue = $state(1);

	// Sync slider with current zoom
	$effect(() => {
		zoomSliderValue = currentZoom;
	});

	function handleZoomSlider(event: Event) {
		const target = event.target as HTMLInputElement;
		const newZoom = parseFloat(target.value);
		canvasStore.setZoom(newZoom);
	}

	// Zoom presets
	function setZoomPreset(zoomLevel: number) {
		canvasStore.setZoom(zoomLevel);
	}
</script>

<div class="controls-container">
	<button class="control-button" onclick={handleAddBox}> + Add Box </button>
	<button
		class="control-button regenerate-button"
		onclick={handleRegenerateScene}
		title="Generate new random scene"
	>
		🎲 New Scene
	</button>
	<ThemeToggle />

	<!-- Zoom Controls -->
	<div class="zoom-controls">
		<span class="zoom-label">🔍</span>
		<button class="zoom-preset" onclick={() => setZoomPreset(0.25)} title="25%">¼</button>
		<button class="zoom-preset" onclick={() => setZoomPreset(0.5)} title="50%">½</button>
		<button class="zoom-preset" onclick={() => setZoomPreset(1)} title="100%">1</button>
		<input
			type="range"
			min="0.1"
			max="5"
			step="0.1"
			value={zoomSliderValue}
			oninput={handleZoomSlider}
			class="zoom-slider"
			title="Zoom: {(currentZoom * 100).toFixed(0)}%"
		/>
		<span class="zoom-value">{(currentZoom * 100).toFixed(0)}%</span>
	</div>

	<!-- Debug Controls -->
	<div class="debug-controls" class:hidden={selectedBoxId === null}>
		<span>ID: {selectedBoxId ?? 'N/A'}</span>
		<label>
			X: <input
				type="number"
				bind:value={debugXInput}
				oninput={(e) => handleDebugInput('x', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
		<label>
			Y: <input
				type="number"
				bind:value={debugYInput}
				oninput={(e) => handleDebugInput('y', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
		<label>
			W: <input
				type="number"
				bind:value={debugWidthInput}
				oninput={(e) => handleDebugInput('width', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
		<label>
			H: <input
				type="number"
				bind:value={debugHeightInput}
				oninput={(e) => handleDebugInput('height', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
	</div>

	<!-- Viewport State Display -->
	<div class="viewport-info">
		Zoom: {currentZoom.toFixed(2)} | X: {currentOffsetX.toFixed(1)} | Y: {currentOffsetY.toFixed(1)}
	</div>

	<!-- Keyboard Shortcuts Hint -->
	{#if selectedBoxId !== null}
		<div class="shortcuts-hint">
			<div class="shortcuts-title">Depth Controls:</div>
			<div class="shortcut">⌘ + ] : Move Forward</div>
			<div class="shortcut">⌘ + [ : Move Backward</div>
		</div>
	{/if}
</div>

<style>
	.controls-container {
		position: fixed;
		bottom: 20px;
		left: 20px;
		z-index: 100;
		display: flex;
		gap: 10px;
		align-items: center;
		background-color: rgba(128, 128, 128, 0.1);
		padding: 8px;
		border-radius: 6px;
	}

	.control-button {
		padding: 6px 10px;
		background-color: var(--control-button-bg);
		color: var(--control-button-text);
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
	}
	.control-button:hover {
		background-color: var(--control-button-hover-bg);
	}

	.regenerate-button {
		background-color: #6c5ce7;
		color: white;
	}

	.regenerate-button:hover {
		background-color: #5f27cd;
	}

	/* Zoom Controls */
	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: 10px;
		padding-left: 10px;
		border-left: 1px solid rgba(255, 255, 255, 0.2);
	}

	.zoom-label {
		font-size: 14px;
		opacity: 0.8;
	}

	.zoom-preset {
		padding: 2px 6px;
		background-color: rgba(255, 255, 255, 0.1);
		color: var(--text-color);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		cursor: pointer;
		font-size: 10px;
		font-weight: bold;
		min-width: 20px;
		text-align: center;
		transition: all 0.2s ease;
	}

	.zoom-preset:hover {
		background-color: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.4);
	}

	.zoom-slider {
		width: 100px;
		height: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
		-webkit-appearance: none;
	}

	.zoom-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		background: #4ecdc4;
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.zoom-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: #4ecdc4;
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.zoom-value {
		font-size: 11px;
		font-family: monospace;
		font-weight: bold;
		color: var(--text-color);
		min-width: 35px;
		text-align: right;
	}

	.debug-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: 15px;
		border-left: 1px solid #ccc;
		padding-left: 15px;
	}

	.debug-controls.hidden {
		display: none;
	}

	.debug-controls span,
	.debug-controls label {
		font-size: 12px;
		color: var(--text-color);
	}

	.debug-input {
		width: 60px;
		padding: 2px 4px;
		border: 1px solid var(--box-border-color);
		background-color: var(--bg-color);
		color: var(--text-color);
		border-radius: 3px;
		font-size: 12px;
	}

	.viewport-info {
		position: fixed; /* Position relative to browser window */
		bottom: 10px; /* Adjust as needed */
		right: 10px; /* Adjust as needed */
		background-color: rgba(0, 0, 0, 0.5);
		color: white;
		padding: 5px 10px;
		border-radius: 4px;
		font-size: 11px;
		font-family: monospace;
		z-index: 100;
		pointer-events: none; /* Allow clicks to pass through */
	}

	.shortcuts-hint {
		position: fixed;
		bottom: 20px;
		left: 20px;
		z-index: 100;
		background-color: rgba(0, 0, 0, 0.5);
		color: white;
		padding: 5px 10px;
		border-radius: 4px;
		font-size: 11px;
		font-family: monospace;
		pointer-events: none;
	}

	.shortcuts-title {
		font-weight: bold;
		margin-bottom: 2px;
	}

	.shortcut {
		font-size: 10px;
		opacity: 0.8;
	}
</style>
