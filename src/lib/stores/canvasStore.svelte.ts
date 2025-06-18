import type { AppBoxState } from '$lib/canvasState';

// --- Constants ---
const ZOOM_PADDING_FACTOR = 0.5; // Zoom to 50% of viewport size

// Core state using $state rune as module-level variables
let zoom = $state(1);
let offsetX = $state(0);
let offsetY = $state(0);
let targetZoom = $state(1);
let targetOffsetX = $state(0);
let targetOffsetY = $state(0);

// Zoom-to-box state
let isAnimatingDoublezoom = $state(false);
let zoomedBoxId = $state<number | null>(null);
let prevZoom = $state(1);
let prevOffsetX = $state(0);
let prevOffsetY = $state(0);

// Fullscreen state
let fullscreenBoxId = $state<number | null>(null);
let originalBoxState = $state<Omit<AppBoxState, 'content' | 'color' | 'type'> | null>(null);
let originalViewZoom = $state(1);
let originalViewOffsetX = $state(0);
let originalViewOffsetY = $state(0);

// Animation state
let isAnimatingFullscreen = $state(false);
let fullscreenTransitionStartTime = $state<number | null>(null);
let transitionSourceZoom = $state(1);
let transitionSourceOffsetX = $state(0);
let transitionSourceOffsetY = $state(0);

let boxes = $state<AppBoxState[]>([
	{
		id: 1,
		x: 100,
		y: 100,
		width: 200,
		height: 200,
		color: 'lightblue',
		content: 'Box 1',
		type: 'sticky',
		z: 0 // Foreground layer
	},
	{
		id: 2,
		x: 400,
		y: 250,
		width: 200,
		height: 200,
		color: 'lightcoral',
		content: 'Box 2',
		type: 'sticky',
		z: -1 // Background layer - will have parallax effect
	},
	{
		id: 3,
		x: -150,
		y: 400,
		width: 250,
		height: 200,
		color: 'lightgoldenrodyellow',
		content: 'Box 3',
		type: 'sticky',
		z: 1 // Further foreground
	},
	{
		id: 4,
		x: 350,
		y: -100,
		width: 200,
		height: 300,
		color: 'lightseagreen',
		content: 'Box 4',
		type: 'sticky',
		z: -2 // Deep background - more parallax
	}
]);
let selectedBoxId = $state<number | null>(null);
let lastSelectedBoxId = $state<number | null>(null);

// Store functions
export const canvasStore = {
	// Getters for accessing state
	get zoom() {
		return zoom;
	},
	get offsetX() {
		return offsetX;
	},
	get offsetY() {
		return offsetY;
	},
	get targetZoom() {
		return targetZoom;
	},
	get targetOffsetX() {
		return targetOffsetX;
	},
	get targetOffsetY() {
		return targetOffsetY;
	},
	get isAnimatingDoublezoom() {
		return isAnimatingDoublezoom;
	},
	get zoomedBoxId() {
		return zoomedBoxId;
	},
	get prevZoom() {
		return prevZoom;
	},
	get prevOffsetX() {
		return prevOffsetX;
	},
	get prevOffsetY() {
		return prevOffsetY;
	},
	get fullscreenBoxId() {
		return fullscreenBoxId;
	},
	get originalBoxState() {
		return originalBoxState;
	},
	get originalViewZoom() {
		return originalViewZoom;
	},
	get originalViewOffsetX() {
		return originalViewOffsetX;
	},
	get originalViewOffsetY() {
		return originalViewOffsetY;
	},
	get isAnimatingFullscreen() {
		return isAnimatingFullscreen;
	},
	get fullscreenTransitionStartTime() {
		return fullscreenTransitionStartTime;
	},
	get transitionSourceZoom() {
		return transitionSourceZoom;
	},
	get transitionSourceOffsetX() {
		return transitionSourceOffsetX;
	},
	get transitionSourceOffsetY() {
		return transitionSourceOffsetY;
	},
	get boxes() {
		return boxes;
	},
	get selectedBoxId() {
		return selectedBoxId;
	},
	get lastSelectedBoxId() {
		return lastSelectedBoxId;
	},

	// Pan the view by a delta (updates current state directly for responsiveness)
	panBy(dx: number, dy: number) {
		const newOffsetX = offsetX + dx;
		const newOffsetY = offsetY + dy;
		// Also update target to prevent animation fighting drag
		offsetX = newOffsetX;
		offsetY = newOffsetY;
		targetOffsetX = newOffsetX;
		targetOffsetY = newOffsetY;
	},

	// Set the target viewport state (used by zooming action)
	setTargetViewport(target: { zoom: number; x: number; y: number }) {
		targetZoom = target.zoom;
		targetOffsetX = target.x;
		targetOffsetY = target.y;
	},

	// Set the actual viewport state (used by animation loop)
	_setViewport(viewport: { zoom: number; x: number; y: number }) {
		zoom = viewport.zoom;
		offsetX = viewport.x;
		offsetY = viewport.y;
	},

	// Add a new box to the canvas
	addBox(box: AppBoxState) {
		boxes.push(box);
	},

	// Update an existing box by partial properties
	updateBox(id: number, partial: Partial<AppBoxState>) {
		const boxIndex = boxes.findIndex((box) => box.id === id);
		if (boxIndex !== -1) {
			const box = boxes[boxIndex];
			const updatedBox = { ...box, ...partial };
			// Enforce minimum dimensions here as well
			if (updatedBox.width !== undefined) {
				updatedBox.width = Math.max(200, updatedBox.width);
			}
			if (updatedBox.height !== undefined) {
				updatedBox.height = Math.max(200, updatedBox.height);
			}
			boxes[boxIndex] = updatedBox;
		}
	},

	// Select a box by ID (or clear selection with null)
	selectBox(id: number | null, viewportWidth?: number, viewportHeight?: number) {
		if (id !== null) {
			// If selecting a box, update both selected and lastSelected
			selectedBoxId = id;
			lastSelectedBoxId = id;

			// If selecting a box in the background, zoom to it
			const box = boxes.find((b) => b.id === id);
			if (box && box.z < 0 && viewportWidth && viewportHeight) {
				this.zoomToBox(id, viewportWidth, viewportHeight);
			}
		} else {
			// If deselecting, only clear selectedId, keep lastSelectedId
			selectedBoxId = null;

			// Also restore previous zoom if we were zoomed in
			if (zoomedBoxId !== null) {
				this.restorePreviousZoom();
			}
		}
	},

	// Enter fullscreen for a box
	enterFullscreen(boxId: number, viewportWidth: number, viewportHeight: number) {
		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex === -1) return;

		// Store original view state only if not already fullscreen
		if (fullscreenBoxId === null) {
			originalViewZoom = zoom;
			originalViewOffsetX = offsetX;
			originalViewOffsetY = offsetY;
		}

		// Store original box state
		const box = boxes[boxIndex];
		originalBoxState = {
			id: box.id,
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			z: box.z
		};

		// Calculate fullscreen dimensions (with padding)
		const padding = 20;
		const fullscreenWidth = viewportWidth - padding * 2;
		const fullscreenHeight = viewportHeight - padding * 2;

		// Update box to fullscreen size and position
		boxes[boxIndex] = {
			...box,
			x: padding,
			y: padding,
			width: fullscreenWidth,
			height: fullscreenHeight
		};

		// Set fullscreen state
		fullscreenBoxId = boxId;

		// Set viewport to show fullscreen box (zoom to 1, center on fullscreen area)
		const targetZoomValue = 1;
		const targetOffsetXValue = 0;
		const targetOffsetYValue = 0;

		canvasStore.setTargetViewport({
			zoom: targetZoomValue,
			x: targetOffsetXValue,
			y: targetOffsetYValue
		});

		// Set animation state
		isAnimatingFullscreen = true;
		fullscreenTransitionStartTime = Date.now();
		transitionSourceZoom = zoom;
		transitionSourceOffsetX = offsetX;
		transitionSourceOffsetY = offsetY;
	},

	// Exit fullscreen mode
	exitFullscreen() {
		if (fullscreenBoxId === null || originalBoxState === null) return;

		// Restore original box state
		const boxIndex = boxes.findIndex((box) => box.id === fullscreenBoxId);
		if (boxIndex !== -1 && originalBoxState) {
			boxes[boxIndex] = {
				...boxes[boxIndex],
				x: originalBoxState.x,
				y: originalBoxState.y,
				width: originalBoxState.width,
				height: originalBoxState.height,
				z: originalBoxState.z
			};
		}

		// Restore original view state
		canvasStore.setTargetViewport({
			zoom: originalViewZoom,
			x: originalViewOffsetX,
			y: originalViewOffsetY
		});

		// Note: Don't clear fullscreen state here - it will be cleared by _finalizeExitFullscreen
		// after the animation completes
	},

	// Finalize exit fullscreen (called after animation completes)
	_finalizeExitFullscreen() {
		fullscreenBoxId = null;
		originalBoxState = null;
		isAnimatingFullscreen = false;
		fullscreenTransitionStartTime = null;
	},

	// Zoom to a specific box with padding
	zoomToBox(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) return;

		// Store previous state for potential restoration
		prevZoom = zoom;
		prevOffsetX = offsetX;
		prevOffsetY = offsetY;

		// Calculate zoom to fit box with padding
		const padding = Math.min(viewportWidth, viewportHeight) * ZOOM_PADDING_FACTOR;
		const zoomX = (viewportWidth - padding) / box.width;
		const zoomY = (viewportHeight - padding) / box.height;
		const targetZoomValue = Math.min(zoomX, zoomY, 3); // Cap at 3x zoom

		// Calculate offset to center the box
		const boxCenterX = box.x + box.width / 2;
		const boxCenterY = box.y + box.height / 2;
		const viewportCenterX = viewportWidth / 2;
		const viewportCenterY = viewportHeight / 2;

		const targetOffsetXValue = viewportCenterX - boxCenterX * targetZoomValue;
		const targetOffsetYValue = viewportCenterY - boxCenterY * targetZoomValue;

		canvasStore.setTargetViewport({
			zoom: targetZoomValue,
			x: targetOffsetXValue,
			y: targetOffsetYValue
		});

		zoomedBoxId = boxId;
		isAnimatingDoublezoom = true;
	},

	// Restore previous zoom level
	restorePreviousZoom() {
		if (zoomedBoxId === null) return;

		canvasStore.setTargetViewport({
			zoom: prevZoom,
			x: prevOffsetX,
			y: prevOffsetY
		});

		zoomedBoxId = null;
		isAnimatingDoublezoom = true;
	},

	// Set animation state
	setAnimatingDoublezoom(value: boolean) {
		isAnimatingDoublezoom = value;
	},

	// Clear fullscreen animation flag
	clearAnimatingFullscreen() {
		isAnimatingFullscreen = false;
	},

	// Get current state for debugging
	getState() {
		return {
			zoom,
			offsetX,
			offsetY,
			targetZoom,
			targetOffsetX,
			targetOffsetY,
			isAnimatingDoublezoom,
			zoomedBoxId,
			prevZoom,
			prevOffsetX,
			prevOffsetY,
			fullscreenBoxId,
			originalBoxState,
			originalViewZoom,
			originalViewOffsetX,
			originalViewOffsetY,
			isAnimatingFullscreen,
			fullscreenTransitionStartTime,
			transitionSourceZoom,
			transitionSourceOffsetX,
			transitionSourceOffsetY,
			boxes,
			selectedBoxId,
			lastSelectedBoxId
		};
	},

	// Z-axis management functions
	moveBoxForward(boxId: number) {
		const boxIndex = boxes.findIndex((box) => box.id === boxId);
		if (boxIndex !== -1) {
			boxes[boxIndex] = {
				...boxes[boxIndex],
				z: boxes[boxIndex].z + 1
			};
		}
	},

	moveBoxBackward(boxId: number) {
		const boxIndex = boxes.findIndex((box) => box.id === boxId);
		if (boxIndex !== -1) {
			boxes[boxIndex] = {
				...boxes[boxIndex],
				z: boxes[boxIndex].z - 1
			};
		}
	},

	// Move selected box forward (Cmd+])
	moveSelectedForward() {
		if (selectedBoxId !== null) {
			canvasStore.moveBoxForward(selectedBoxId);
		}
	},

	// Move selected box backward (Cmd+[)
	moveSelectedBackward() {
		if (selectedBoxId !== null) {
			canvasStore.moveBoxBackward(selectedBoxId);
		}
	},

	// Get boxes sorted by Z-index for rendering order
	getBoxesByZIndex() {
		return [...boxes].sort((a, b) => a.z - b.z);
	}
};
