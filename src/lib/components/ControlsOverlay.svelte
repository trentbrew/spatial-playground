<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import { MAX_NODE_WIDTH, MAX_NODE_HEIGHT } from '$lib/constants';
	import ThemeToggle from './ThemeToggle.svelte';
	import { canvasZeroAdapter, zero } from '$lib/stores/canvasZeroAdapter.svelte';

	// Direct access to store properties (reactive)
	const selectedBoxId = $derived(canvasStore.selectedBoxId);
	const boxes = $derived(canvasStore.boxes);
	const selectedBox = $derived(boxes.find((box) => box.id === selectedBoxId));

	// Viewport state for display
	const currentZoom = $derived(canvasStore.zoom);
	const currentOffsetX = $derived(canvasStore.offsetX);
	const currentOffsetY = $derived(canvasStore.offsetY);
	const apertureEnabled = $derived(canvasStore.apertureEnabled);

	// Persistence state
	const persistenceEnabled = $derived(canvasStore.persistenceEnabled);
	const hasSavedState = $derived(canvasStore.hasSavedState);

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
		const nodeTypes = ['sticky', 'image', 'text', 'code'] as const;

		// Use consistent dark gray for all nodes
		const defaultColor = '#2a2a2a';

		// Create a new box with random properties
		const newId = Math.max(...boxes.map((b) => b.id), 0) + 1;
		const color = defaultColor;
		const type = nodeTypes[Math.floor(Math.random() * nodeTypes.length)];
		const width = Math.min(150 + Math.random() * 100, MAX_NODE_WIDTH);
		const height = Math.min(120 + Math.random() * 80, MAX_NODE_HEIGHT);
		const z = Math.floor(Math.random() * 4) - 3; // Z from -3 to 0

		// Calculate viewport center in world coordinates
		const viewport = document.querySelector('.viewport') as HTMLElement;
		const viewportWidth = viewport?.clientWidth || 800;
		const viewportHeight = viewport?.clientHeight || 600;

		// Convert viewport center to world coordinates
		const worldCenterX = (viewportWidth / 2 - currentOffsetX) / currentZoom;
		const worldCenterY = (viewportHeight / 2 - currentOffsetY) / currentZoom;

		const newBox = {
			id: newId,
			x: worldCenterX - width / 2, // Center the node at viewport center
			y: worldCenterY - height / 2, // Center the node at viewport center
			width: Math.round(width),
			height: Math.round(height),
			color,
			content: `New ${type.charAt(0).toUpperCase() + type.slice(1)} ${newId}`,
			type,
			z
		};

		// Add with collision avoidance enabled
		canvasStore.addBox(newBox, true);
	}

	async function handleRegenerateScene() {
		await canvasStore.regenerateScene();
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
		canvasStore.setZoom(newZoom, { autoUnfocus: true });

		// Refresh ghosting when zoom changes
		const viewport = document.querySelector('.viewport') as HTMLElement;
		if (viewport) {
			const width = viewport.clientWidth;
			const height = viewport.clientHeight;
			if (width > 0 && height > 0) {
				canvasStore.onViewChange(width, height);
			}
		}
	}

	// Zoom presets
	function setZoomPreset(zoomLevel: number) {
		canvasStore.setZoom(zoomLevel, { autoUnfocus: true });

		// Refresh ghosting when zoom changes
		const viewport = document.querySelector('.viewport') as HTMLElement;
		if (viewport) {
			const width = viewport.clientWidth;
			const height = viewport.clientHeight;
			if (width > 0 && height > 0) {
				canvasStore.onViewChange(width, height);
			}
		}
	}

	// Zero test functions
	async function testZeroSave() {
		try {
			console.log('🧪 Testing Zero save...');

			// Save current viewport state to Zero
			await canvasZeroAdapter.updateViewport({
				zoom: currentZoom,
				offsetX: currentOffsetX,
				offsetY: currentOffsetY,
				selectedBoxId: selectedBoxId,
				fullscreenBoxId: null,
				lastSelectedBoxId: selectedBoxId,
				persistenceEnabled: persistenceEnabled
			});

			console.log('✅ Zero save test completed - viewport state saved');
		} catch (error) {
			console.error('❌ Zero save test failed:', error);
		}
	}

	async function testZeroLoad() {
		try {
			console.log('🧪 Testing Zero load...');

			// Log current store state
			let canvasState: any = null;
			let allNodes: any = null;

			canvasZeroAdapter.canvasState.subscribe((val) => (canvasState = val))();
			canvasZeroAdapter.allNodes.subscribe((val) => (allNodes = val))();

			console.log('📊 Current Zero state:');
			console.log('  Canvas State:', canvasState);
			console.log('  All Nodes:', allNodes);

			// Try direct Zero queries for verification
			const canvasQuery = await zero.query.canvas_state.run();
			const nodesQuery = await zero.query.nodes.run();
			console.log('📊 Direct Zero queries:');
			console.log('  Canvas states:', canvasQuery);
			console.log('  Nodes:', nodesQuery);

			console.log('✅ Zero load test completed');
		} catch (error) {
			console.error('❌ Zero load test failed:', error);
		}
	}

	async function testZeroMutation() {
		try {
			console.log('🧪 Testing Zero mutation...');

			// Add a test node using Zero
			await canvasZeroAdapter.addNode({
				x: Math.random() * 500,
				y: Math.random() * 500,
				width: 200,
				height: 150,
				type: 'sticky-note',
				content: { text: `Zero Test Node ${Date.now()}` }
			});

			console.log('✅ Zero mutation test completed - added test node');
		} catch (error) {
			console.error('❌ Zero mutation test failed:', error);
		}
	}

	async function testZeroPersistence() {
		try {
			console.log('🧪 Testing complete Zero persistence flow...');

			// 1. Save current state
			await testZeroSave();

			// 2. Wait a moment for Zero to process
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// 3. Load and verify state
			await testZeroLoad();

			// 4. Test node creation
			await testZeroMutation();

			// 5. Final verification
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await testZeroLoad();

			console.log('✅ Complete Zero persistence test completed');
		} catch (error) {
			console.error('❌ Zero persistence test failed:', error);
		}
	}

	async function testAddNode() {
		console.log('🧪 Testing Zero - Adding node...');
		await canvasZeroAdapter.addNode({
			x: Math.random() * 500,
			y: Math.random() * 500,
			width: 200,
			height: 150,
			type: 'sticky-note',
			content: { text: `Test node ${Date.now()}` }
		});
		console.log('✅ Node added to Zero');
	}

	async function testUpdateCanvas() {
		console.log('🧪 Testing Zero - Updating canvas...');
		await canvasZeroAdapter.updateViewport({
			zoom: Math.random() * 2 + 0.5,
			offsetX: Math.random() * 100,
			offsetY: Math.random() * 100
		});
		console.log('✅ Canvas updated in Zero');
	}

	async function showCanvasState() {
		console.log('🧪 Testing Zero - Current state:');
		console.log('Canvas State:', canvasZeroAdapter.canvasState);
		console.log('All Nodes:', canvasZeroAdapter.allNodes);
		console.log('Zero client:', zero);

		// Also try to query directly
		try {
			const canvasQuery = await zero.query.canvas_state.run();
			const nodesQuery = await zero.query.nodes.run();
			console.log('📊 Direct Zero queries:');
			console.log('  Canvas states:', canvasQuery);
			console.log('  Nodes:', nodesQuery);
		} catch (error) {
			console.error('❌ Direct query failed:', error);
		}
	}
</script>

<div class="controls-container">
	<button class="control-button" data-cursor="button" onclick={handleAddBox}> + Add Box </button>
	<button
		class="control-button regenerate-button"
		data-cursor="button"
		onclick={handleRegenerateScene}
		title="Generate artwork gallery from your collection"
	>
		🖼️ Artwork Gallery
	</button>
	<button
		class="control-button clear-scene-button"
		data-cursor="button"
		onclick={() => canvasStore.clearScene()}
		title="Clear all nodes and start with a blank scene"
	>
		🧹 Clear Scene
	</button>
	<button
		class="control-button aperture-toggle"
		data-cursor="button"
		onclick={() => canvasStore.toggleAperture()}
		title={apertureEnabled ? 'Disable Aperture Effect' : 'Enable Aperture Effect'}
	>
		{apertureEnabled ? '✨' : '➖'} Aperture
	</button>

	<!-- Zero Test Controls -->
	<div class="zero-controls">
		<button
			class="control-button zero-test-button"
			data-cursor="button"
			onclick={() => testZeroSave()}
			title="Test saving to Zero"
		>
			💾 Zero Save
		</button>
		<button
			class="control-button zero-test-button"
			data-cursor="button"
			onclick={() => testZeroLoad()}
			title="Test loading from Zero"
		>
			📂 Zero Load
		</button>
		<button
			class="control-button zero-test-button"
			data-cursor="button"
			onclick={() => testZeroMutation()}
			title="Test Zero mutation"
		>
			🔄 Zero Mutate
		</button>
		<button
			class="control-button zero-test-button"
			data-cursor="button"
			onclick={() => testZeroPersistence()}
			title="Test complete Zero persistence flow"
		>
			🧪 Full Test
		</button>
	</div>

	<ThemeToggle />

	<!-- Zoom Controls -->
	<div class="zoom-controls">
		<span class="zoom-label">🔍</span>
		<button class="zoom-preset" data-cursor="button" onclick={() => setZoomPreset(0.25)} title="25%"
			>¼</button
		>
		<button class="zoom-preset" data-cursor="button" onclick={() => setZoomPreset(0.5)} title="50%"
			>½</button
		>
		<button class="zoom-preset" data-cursor="button" onclick={() => setZoomPreset(1)} title="100%"
			>1</button
		>
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
	<!-- <div class="viewport-info">
		Zoom: {currentZoom.toFixed(2)} | X: {currentOffsetX.toFixed(1)} | Y: {currentOffsetY.toFixed(1)}
	</div> -->

	<!-- Keyboard Shortcuts Hint -->
	<!-- {#if selectedBoxId !== null}
		<div class="shortcuts-hint">
			<div class="shortcuts-title">Depth Controls:</div>
			<div class="shortcut">⌘ + ] : Move Forward</div>
			<div class="shortcut">⌘ + [ : Move Backward</div>
		</div>
	{/if} -->
</div>

<style>
	.controls-container {
		position: fixed;
		bottom: 20px;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		margin: 0 20px;
		z-index: 100;
		display: flex;
		gap: 10px;
		align-items: center;
		background-color: rgba(128, 128, 128, 0.1);
		backdrop-filter: blur(24px);
		padding: 8px;
		border-radius: 10px;
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

	.aperture-toggle {
		background-color: var(--control-button-bg);
		transition: background-color 0.2s;
	}

	.aperture-toggle:hover {
		background-color: var(--control-button-hover-bg);
	}

	/* Persistence Controls */
	.persistence-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: 10px;
		padding-left: 10px;
		border-left: 1px solid rgba(255, 255, 255, 0.2);
	}

	.save-button {
		background-color: #27ae60;
		color: white;
	}

	.save-button:hover {
		background-color: #219a52;
	}

	.load-button {
		background-color: #3498db;
		color: white;
	}

	.load-button:hover:not(:disabled) {
		background-color: #2980b9;
	}

	.clear-saved-button {
		background-color: #e74c3c;
		color: white;
	}

	.clear-saved-button:hover:not(:disabled) {
		background-color: #c0392b;
	}

	.persistence-toggle {
		background-color: var(--control-button-bg);
		transition: background-color 0.2s;
	}

	.persistence-toggle:hover {
		background-color: var(--control-button-hover-bg);
	}

	.control-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Zero Controls */
	.zero-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: 10px;
		padding-left: 10px;
		border-left: 1px solid rgba(255, 255, 255, 0.2);
	}

	.zero-test-button {
		background-color: #9b59b6;
		color: white;
	}

	.zero-test-button:hover {
		background-color: #8e44ad;
	}
</style>
