<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { browser } from '$app/environment';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import BackgroundCanvas from '$lib/components/BackgroundCanvas.svelte';
	import NodesLayer from '$lib/components/NodesLayer.svelte';
	import { panning } from '$lib/interactions/panning.svelte.ts';
	import { zooming } from '$lib/interactions/zooming.svelte.ts';
	import { setViewportContext } from '$lib/contexts/viewportContext';
	import ControlsOverlay from './ControlsOverlay.svelte';
	import TracingIndicator from './TracingIndicator.svelte';
	import ObstructionIndicator from './ObstructionIndicator.svelte';
	import SceneStats from './SceneStats.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenuStore.svelte';
	import {
		FOCUS_TRANSITION_DURATION,
		DEFAULT_NODE_DIMENSIONS,
		MAX_NODE_WIDTH,
		MAX_NODE_HEIGHT
	} from '$lib/constants';
	// Lucide icons - ignore TS type errors via global declaration
	// @ts-ignore
	import {
		StickyNote,
		Code,
		Image as ImageIcon,
		Globe,
		Clipboard,
		ZoomIn,
		Target,
		Shuffle
	} from '@lucide/svelte';
	import { zoom, offsetX, offsetY } from '$lib/stores/viewportStore';

	// --- Constants ---
	const SMOOTHING_FACTOR = 0.4;

	// --- Utility Functions ---
	function lerp(start: number, end: number, factor: number): number {
		return start + (end - start) * factor;
	}

	function easeOutQuart(t: number): number {
		return 1 - Math.pow(1 - t, 4);
	}

	let viewportElement: HTMLDivElement;

	// Direct access to store properties (reactive)
	const boxes = $derived(canvasStore.boxes);
	const selectedBoxId = $derived(canvasStore.selectedBoxId);
	const fullscreenBoxId = $derived(canvasStore.fullscreenBoxId);
	const zoomedBoxId = $derived(canvasStore.zoomedBoxId);
	const isAnimatingDoublezoom = $derived(canvasStore.isAnimatingDoublezoom);

	// Animation duration from store
	const animationDuration = $derived(canvasStore.animationDuration);

	// Create writable stores for viewport element and dimensions
	const viewportElementStore = writable<HTMLElement | null>(null);
	const viewportWidthStore = writable<number>(0);
	const viewportHeightStore = writable<number>(0);

	// Current viewport state (reactive) - use canvasStore directly
	const currentZoom = $derived(canvasStore.zoom);
	const currentOffsetX = $derived(canvasStore.offsetX);
	const currentOffsetY = $derived(canvasStore.offsetY);

	// --- Context Menu Reactive Bindings ---
	const cmVisible = $derived(contextMenuStore.visible);
	const cmX = $derived(contextMenuStore.x);
	const cmY = $derived(contextMenuStore.y);
	const cmWorldX = $derived(contextMenuStore.worldX);
	const cmWorldY = $derived(contextMenuStore.worldY);
	const cmItems = $derived(contextMenuStore.items);
	const cmTargetId = $derived(contextMenuStore.targetId);

	// Provide context
	setViewportContext({
		elementStore: viewportElementStore,
		width: viewportWidthStore,
		height: viewportHeightStore
	});

	onMount(() => {
		// Update element store when element is bound
		viewportElementStore.set(viewportElement);

		// Global keyboard handler to prevent browser shortcuts
		const globalKeyHandler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && (event.key === '[' || event.key === ']')) {
				event.preventDefault();
				event.stopPropagation();
				handleKeyDown(event);
			}
		};

		document.addEventListener('keydown', globalKeyHandler);

		const cleanup = () => {
			document.removeEventListener('keydown', globalKeyHandler);
		};

		// Observe viewport dimensions
		const resizeObserver = new ResizeObserver((entries) => {
			if (entries[0]) {
				const { width, height } = entries[0].contentRect;
				viewportWidthStore.set(width);
				viewportHeightStore.set(height);

				// Refresh ghosting when viewport size changes
				if (width > 0 && height > 0) {
					canvasStore.onViewChange(width, height);
				}
			}
		});
		if (viewportElement) {
			resizeObserver.observe(viewportElement);
		}

		// --- Initial View Calculation ---
		if (!browser || !viewportElement) return;

		// Run this only once on initial mount
		requestAnimationFrame(() => {
			const initialBoxes = canvasStore.boxes;
			if (initialBoxes.length === 0) return; // No boxes, nothing to center

			const viewportWidth = viewportElement.clientWidth;
			const viewportHeight = viewportElement.clientHeight;
			if (viewportWidth === 0 || viewportHeight === 0) return; // Avoid division by zero

			const bbox = calculateBoundingBox(initialBoxes);
			if (!bbox) return;

			const optimalView = calculateOptimalViewport(bbox, viewportWidth, viewportHeight);

			// Set initial state directly, bypassing animation
			console.log('[CanvasViewport] Setting initial calculated view:', optimalView);
			canvasStore._setViewport(optimalView);
			canvasStore.setTargetViewport(optimalView);
		});

		return () => {
			cleanup(); // Remove global keyboard listener
			resizeObserver.disconnect();
		};
	});

	// --- Event Handlers ---
	function handleViewportClick(event: MouseEvent) {
		// Close context menu on any click
		contextMenuStore.hide();

		// Deselect box if the click didn't originate from a node box, resize handle, or the controls overlay
		const targetElement = event.target as Element;
		if (
			!targetElement.closest('.box') &&
			!targetElement.closest('.resize-handle') &&
			!targetElement.closest('.controls-overlay')
		) {
			// Simply deselect the current box without any zoom changes
			canvasStore.selectBox(null);
		}
	}

	function handleViewportRightClick(event: MouseEvent) {
		// Only handle background right-clicks (not on nodes)
		const targetElement = event.target as Element;
		if (targetElement.closest('.box')) {
			return; // Let the node handle its own context menu
		}

		event.preventDefault();
		event.stopPropagation();

		// Convert screen coordinates to world coordinates
		const rect = viewportElement.getBoundingClientRect();
		const screenX = event.clientX - rect.left;
		const screenY = event.clientY - rect.top;

		// Convert to world coordinates accounting for zoom and offset
		const worldX = (screenX - currentOffsetX) / currentZoom;
		const worldY = (screenY - currentOffsetY) / currentZoom;

		// Generate background context menu items
		const items: ContextMenuItem[] = [
			{
				id: 'add-note',
				label: 'Add Note',
				icon: StickyNote
			},
			{
				id: 'add-code',
				label: 'Add Code Block',
				icon: Code
			},
			{
				id: 'add-image',
				label: 'Add Image',
				icon: ImageIcon
			},
			{
				id: 'add-embed',
				label: 'Add Embed',
				icon: Globe
			},
			{ id: 'sep1', label: '', separator: true },
			{
				id: 'paste',
				label: 'Paste',
				icon: Clipboard,
				disabled: true // TODO: implement clipboard detection
			},
			{ id: 'sep2', label: '', separator: true },
			{
				id: 'zoom-fit',
				label: 'Zoom to Fit All',
				icon: ZoomIn
			},
			{
				id: 'center-view',
				label: 'Center View',
				icon: Target
			},
			{ id: 'sep3', label: '', separator: true },
			{
				id: 'regenerate',
				label: 'Generate Artwork Gallery',
				icon: Shuffle
			}
		];

		// Show context menu at click position with world coordinates
		contextMenuStore.show(event.clientX, event.clientY, items, undefined, worldX, worldY);
	}

	function handleContextMenuSelect(event: CustomEvent<{ itemId: string; targetId?: number }>) {
		const { itemId, targetId } = event.detail;
		const viewportWidth = viewportElement?.clientWidth || 0;
		const viewportHeight = viewportElement?.clientHeight || 0;

		// Handle node-specific actions
		if (targetId) {
			const box = boxes.find((b) => b.id === targetId);
			if (!box) return;

			switch (itemId) {
				case 'focus':
					canvasStore.selectBox(targetId, viewportWidth, viewportHeight);
					canvasStore.zoomToBox(targetId, viewportWidth, viewportHeight);
					break;
				case 'duplicate':
					// Create a new box slightly offset from the original
					const newBox = {
						...box,
						id: Date.now(), // Simple ID generation
						x: box.x + 20,
						y: box.y + 20
					};
					canvasStore.addBox(newBox);
					break;
				case 'bring-forward':
					// First select the box, then move it forward
					canvasStore.selectBox(targetId, viewportWidth, viewportHeight);
					canvasStore.moveSelectedForward(viewportWidth, viewportHeight);
					break;
				case 'send-backward':
					// First select the box, then move it backward
					canvasStore.selectBox(targetId, viewportWidth, viewportHeight);
					canvasStore.moveSelectedBackward(viewportWidth, viewportHeight);
					break;
				case 'delete':
					canvasStore.deleteBox(targetId);
					break;
			}
		} else {
			// Handle background actions
			const worldX = contextMenuStore.worldX || 0;
			const worldY = contextMenuStore.worldY || 0;

			switch (itemId) {
				case 'add-note':
					createNewNode('note', worldX, worldY);
					break;
				case 'add-code':
					createNewNode('code', worldX, worldY);
					break;
				case 'add-image':
					triggerImageUpload(worldX, worldY);
					break;
				case 'add-embed':
					createNewNode('embed', worldX, worldY);
					break;
				case 'zoom-fit':
					zoomToFitAll();
					break;
				case 'center-view':
					centerView();
					break;
				case 'regenerate':
					canvasStore.regenerateScene().catch(console.error);
					break;
			}
		}
	}

	function createNewNode(type: string, worldX: number, worldY: number) {
		// Get dimensions for this node type, fallback to sticky dimensions
		const dimensions =
			DEFAULT_NODE_DIMENSIONS[type as keyof typeof DEFAULT_NODE_DIMENSIONS] ||
			DEFAULT_NODE_DIMENSIONS.sticky;

		const newBox = {
			id: Date.now(),
			x: worldX - dimensions.width / 2, // Center the box on click point
			y: worldY - dimensions.height / 2, // Center the box on click point
			width: dimensions.width,
			height: dimensions.height,
			z: 0, // Start at focus plane
			content: getDefaultContent(type),
			color: getRandomColor(),
			type: type
		};

		canvasStore.addBox(newBox);

		// Select and focus the new node
		const viewportWidth = viewportElement?.clientWidth || 0;
		const viewportHeight = viewportElement?.clientHeight || 0;
		canvasStore.selectBox(newBox.id, viewportWidth, viewportHeight);
		canvasStore.zoomToBox(newBox.id, viewportWidth, viewportHeight);
	}

	function getDefaultContent(type: string): string {
		switch (type) {
			case 'note':
				return 'New note...';
			case 'code':
				return '// New code block\nconsole.log("Hello, world!");';
			case 'image':
				return 'Image placeholder';
			case 'embed':
				return ''; // Start with empty content to show input prompt
			default:
				return 'New content';
		}
	}

	function getRandomColor(): string {
		// Use consistent dark gray for all nodes
		return '#2a2a2a';
	}

	function zoomToFitAll() {
		if (boxes.length === 0) return;

		const bbox = calculateBoundingBox(boxes);
		if (!bbox) return;

		const viewportWidth = viewportElement?.clientWidth || 0;
		const viewportHeight = viewportElement?.clientHeight || 0;
		const optimalView = calculateOptimalViewport(bbox, viewportWidth, viewportHeight);

		// Animate to the optimal view
		canvasStore.setTargetViewportAnimated(optimalView, 500);
	}

	function centerView() {
		// Reset to center with current zoom
		const viewportWidth = viewportElement?.clientWidth || 0;
		const viewportHeight = viewportElement?.clientHeight || 0;

		canvasStore.setTargetViewportAnimated(
			{
				zoom: currentZoom,
				x: viewportWidth / 2,
				y: viewportHeight / 2
			},
			300
		);
	}

	// Keyboard event handler for Z-axis management
	function handleKeyDown(event: KeyboardEvent) {
		// Handle Escape key to unfocus nodes
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			canvasStore.unfocusNode();
			return;
		}

		// Check for Cmd+] (move forward in Z) or Cmd+[ (move backward in Z)
		if (event.metaKey || event.ctrlKey) {
			if (event.key === ']' || event.key === '[') {
				// Always prevent default browser behavior for these shortcuts
				event.preventDefault();
				event.stopPropagation();

				// Only execute if we have a selected box
				if (selectedBoxId !== null) {
					// Get current viewport dimensions for zoom following
					const viewportWidth = viewportElement?.clientWidth || 0;
					const viewportHeight = viewportElement?.clientHeight || 0;

					if (event.key === ']') {
						canvasStore.moveSelectedForward(viewportWidth, viewportHeight);
						console.log(`Moved box ${selectedBoxId} forward in Z-axis with zoom following`);
					} else if (event.key === '[') {
						canvasStore.moveSelectedBackward(viewportWidth, viewportHeight);
						console.log(`Moved box ${selectedBoxId} backward in Z-axis with zoom following`);
					}
				}
			}
		}
	}

	// --- Geometry Helper Types/Functions (Defined After Variables) ---
	interface BoundingBox {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
		width: number;
		height: number;
	}

	function calculateBoundingBox(boxes: AppBoxState[]): BoundingBox | null {
		if (boxes.length === 0) return null;

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const box of boxes) {
			minX = Math.min(minX, box.x);
			minY = Math.min(minY, box.y);
			maxX = Math.max(maxX, box.x + box.width);
			maxY = Math.max(maxY, box.y + box.height);
		}

		const width = maxX - minX;
		const height = maxY - minY;

		return { minX, minY, maxX, maxY, width, height };
	}

	function calculateOptimalViewport(
		bbox: BoundingBox,
		viewportWidth: number,
		viewportHeight: number
	): { zoom: number; x: number; y: number } {
		const padding = 50; // Add some padding around all boxes
		const bboxWidth = bbox.width + padding * 2;
		const bboxHeight = bbox.height + padding * 2;

		const zoomX = viewportWidth / bboxWidth;
		const zoomY = viewportHeight / bboxHeight;
		const newZoom = Math.min(zoomX, zoomY, 1); // Cap initial zoom at 1

		const newOffsetX = (viewportWidth - bbox.width * newZoom) / 2 - bbox.minX * newZoom;
		const newOffsetY = (viewportHeight - bbox.height * newZoom) / 2 - bbox.minY * newZoom;

		return { zoom: newZoom, x: newOffsetX, y: newOffsetY };
	}

	// ---------------- Image Upload ----------------
	let fileInput: HTMLInputElement | null = null;
	let pendingWorldX = 0;
	let pendingWorldY = 0;

	function triggerImageUpload(worldX: number, worldY: number) {
		pendingWorldX = worldX;
		pendingWorldY = worldY;
		if (fileInput) {
			// reset so change fires even if same file selected twice
			fileInput.value = '';
			fileInput.click();
		}
	}

	function handleFileInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;
		const file = target.files[0];
		if (!file.type.startsWith('image/')) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const dataUrl = e.target?.result as string;
			if (!dataUrl) return;
			createImageNodeFromDataUrl(dataUrl, pendingWorldX, pendingWorldY);
		};
		reader.readAsDataURL(file);
	}

	async function createImageNodeFromDataUrl(dataUrl: string, worldX: number, worldY: number) {
		const { width: imgW, height: imgH } = await loadImageDimensions(dataUrl);

		// Calculate the aspect ratio
		const aspectRatio = imgW / imgH;

		// Set maximum dimensions
		const MAX_DIM = MAX_NODE_WIDTH;

		// Calculate dimensions that maintain aspect ratio and fit within MAX_DIM
		let boxWidth, boxHeight;

		if (aspectRatio > 1) {
			// Landscape: width is the limiting factor
			boxWidth = Math.min(imgW, MAX_DIM);
			boxHeight = Math.round(boxWidth / aspectRatio);
		} else {
			// Portrait or square: height is the limiting factor
			boxHeight = Math.min(imgH, MAX_DIM);
			boxWidth = Math.round(boxHeight * aspectRatio);
		}

		const newBox = {
			id: Date.now(),
			x: worldX - boxWidth / 2,
			y: worldY - boxHeight / 2,
			width: boxWidth,
			height: boxHeight,
			z: 0,
			content: dataUrl,
			color: getRandomColor(),
			type: 'image'
		};
		canvasStore.addBox(newBox);

		const viewportWidth = viewportElement?.clientWidth || 0;
		const viewportHeight = viewportElement?.clientHeight || 0;
		canvasStore.selectBox(newBox.id, viewportWidth, viewportHeight);
		canvasStore.zoomToBox(newBox.id, viewportWidth, viewportHeight);
	}

	function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
			img.onerror = reject;
			img.src = src;
		});
	}

	// ---------------- Drag & Drop ----------------
	function handleDragOver(event: DragEvent) {
		event.preventDefault(); // necessary to allow drop
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();

		if (!viewportElement) return;

		// Calculate world coordinates of drop
		const rect = viewportElement.getBoundingClientRect();
		const screenX = event.clientX - rect.left;
		const screenY = event.clientY - rect.top;
		const worldX = (screenX - currentOffsetX) / currentZoom;
		const worldY = (screenY - currentOffsetY) / currentZoom;

		// If files present and first is image
		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
			if (file) {
				const reader = new FileReader();
				reader.onload = (e) => {
					const dataUrl = e.target?.result as string;
					if (dataUrl) createImageNodeFromDataUrl(dataUrl, worldX, worldY);
				};
				reader.readAsDataURL(file);
				return;
			}
		}

		// Otherwise check for image URL in transfer data
		const uriList = event.dataTransfer?.getData('text/uri-list');
		const textData = event.dataTransfer?.getData('text/plain');
		const url = uriList || textData;
		if (url && url.match(/\.(png|jpe?g|gif|bmp|webp|svg)(\?.*)?$/i)) {
			createImageNodeFromDataUrl(url, worldX, worldY);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={viewportElement}
	class="viewport"
	role="application"
	use:panning
	use:zooming
	onclick={handleViewportClick}
	oncontextmenu={handleViewportRightClick}
	onkeydown={handleKeyDown}
	ondragover={handleDragOver}
	ondrop={handleDrop}
	tabindex="0"
>
	<BackgroundCanvas />
	<NodesLayer />
</div>

<!-- <SceneStats /> -->
<ControlsOverlay />
<TracingIndicator />
<ObstructionIndicator />

<ContextMenu
	visible={cmVisible}
	x={cmX}
	y={cmY}
	worldX={cmWorldX}
	worldY={cmWorldY}
	zoom={currentZoom}
	offsetX={currentOffsetX}
	offsetY={currentOffsetY}
	items={cmItems}
	targetId={cmTargetId}
	on:select={handleContextMenuSelect}
	on:close={() => contextMenuStore.hide()}
/>

<!-- Hidden file input for image uploads -->
<input
	type="file"
	accept="image/*"
	bind:this={fileInput}
	onchange={handleFileInputChange}
	style="display: none;"
/>

<style>
	.viewport {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background-color: var(--bg-canvas-color);
		cursor: grab;
		outline: none; /* Remove focus outline */
	}

	.viewport:active {
		cursor: grabbing;
	}
</style>
