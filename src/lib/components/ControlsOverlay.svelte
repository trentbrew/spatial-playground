<script lang="ts">
	import { onDestroy } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore';
	import type { AppBoxState } from '$lib/canvasState';
	import ThemeToggle from './ThemeToggle.svelte'; // Assuming this exists

	let selectedBoxId: number | null = null;
	let boxes: AppBoxState[] = [];

	let selectedBox: AppBoxState | undefined;

	// Viewport state for display
	let currentZoom: number = 1;
	let currentOffsetX: number = 0;
	let currentOffsetY: number = 0;

	// Input values, synced one-way from selected box
	let debugXInput: string = '';
	let debugYInput: string = '';
	let debugWidthInput: string = '';
	let debugHeightInput: string = '';

	const unsubscribe = canvasStore.subscribe((state) => {
		selectedBoxId = state.selectedBoxId;
		boxes = state.boxes;
		// Find selected box based on ID
		selectedBox = boxes.find((box) => box.id === selectedBoxId);

		// Update viewport state
		currentZoom = state.zoom;
		currentOffsetX = state.offsetX;
		currentOffsetY = state.offsetY;

		// Update input fields only if a box is selected
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

	onDestroy(unsubscribe);

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
</script>

<div class="controls-container">
	<button class="control-button" on:click={handleAddBox}> + Add Box </button>
	<ThemeToggle />

	<!-- Debug Controls -->
	<div class="debug-controls" class:hidden={selectedBoxId === null}>
		<span>ID: {selectedBoxId ?? 'N/A'}</span>
		<label>
			X: <input
				type="number"
				bind:value={debugXInput}
				on:input={(e) => handleDebugInput('x', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
		<label>
			Y: <input
				type="number"
				bind:value={debugYInput}
				on:input={(e) => handleDebugInput('y', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
		<label>
			W: <input
				type="number"
				bind:value={debugWidthInput}
				on:input={(e) => handleDebugInput('width', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
		<label>
			H: <input
				type="number"
				bind:value={debugHeightInput}
				on:input={(e) => handleDebugInput('height', e.currentTarget.value)}
				class="debug-input"
			/></label
		>
	</div>

	<!-- Viewport State Display -->
	<div class="viewport-info">
		Zoom: {currentZoom.toFixed(2)} | X: {currentOffsetX.toFixed(1)} | Y: {currentOffsetY.toFixed(1)}
	</div>
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
</style>
