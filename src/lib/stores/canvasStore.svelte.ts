import type { AppBoxState } from '$lib/canvasState';
import {
	FOCUS_TRANSITION_DURATION,
	FOCAL_PLANE_TARGET_SCALE,
	DOF_SHARPNESS_FACTOR
} from '$lib/constants';
import { getIntrinsicScaleFactor, getFocusZoomForZ, getParallaxFactor } from '$lib/utils/depth';
import { detectObstruction } from '$lib/utils/obstruction';

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
let animationDuration = $state(0); // Add animation duration state

// Generate a rich, multi-layered scene with varied nodes
function generateRandomBoxes(): AppBoxState[] {
	const colors = [
		'#FF6B6B',
		'#4ECDC4',
		'#45B7D1',
		'#96CEB4',
		'#FECA57',
		'#FF9FF3',
		'#54A0FF',
		'#5F27CD',
		'#00D2D3',
		'#FF9F43',
		'#10AC84',
		'#EE5A24',
		'#0984E3',
		'#6C5CE7',
		'#A29BFE',
		'#FD79A8',
		'#FDCB6E',
		'#E17055',
		'#81ECEC',
		'#74B9FF',
		'#55A3FF',
		'#26DE81',
		'#FD79A8',
		'#A29BFE',
		'#6C5CE7'
	];

	const nodeTypes = ['sticky', 'image', 'text', 'code'];
	const boxes: AppBoxState[] = [];

	// Create a diverse set of nodes across different depths
	for (let i = 1; i <= 25; i++) {
		const z = Math.floor(Math.random() * 7) - 3; // Z from -3 to +3
		const x = (Math.random() - 0.5) * 2000; // X from -1000 to +1000
		const y = (Math.random() - 0.5) * 1500; // Y from -750 to +750

		// Vary sizes based on depth for visual interest
		const baseSize = z >= 0 ? 180 + Math.random() * 120 : 150 + Math.random() * 100;
		const width = baseSize + Math.random() * 80;
		const height = baseSize + Math.random() * 60;

		const color = colors[Math.floor(Math.random() * colors.length)];
		const type = nodeTypes[Math.floor(Math.random() * nodeTypes.length)];

		// Create content based on type and depth
		let content = `${type.charAt(0).toUpperCase() + type.slice(1)} ${i}`;
		if (z < 0) content += ` (Depth ${Math.abs(z)})`;
		if (z > 0) content += ` (Layer +${z})`;

		boxes.push({
			id: i,
			x: Math.round(x),
			y: Math.round(y),
			width: Math.round(width),
			height: Math.round(height),
			color,
			content,
			type: type as 'sticky' | 'image' | 'text' | 'code',
			z
		});
	}

	// Add a few strategic overlapping nodes to showcase obstruction detection
	boxes.push(
		{
			id: 26,
			x: 0,
			y: 0,
			width: 220,
			height: 180,
			color: '#FF6B6B',
			content: 'Center Focus Node',
			type: 'sticky',
			z: 0 // Middle layer
		},
		{
			id: 27,
			x: 50,
			y: 30,
			width: 160,
			height: 140,
			color: '#4ECDC4',
			content: 'Overlapping Front',
			type: 'image',
			z: 1 // In front of center node
		},
		{
			id: 28,
			x: -30,
			y: 60,
			width: 180,
			height: 120,
			color: '#45B7D1',
			content: 'Another Overlay',
			type: 'text',
			z: 2 // Even further in front
		}
	);

	const sortedBoxes = boxes.sort((a, b) => a.z - b.z); // Sort by z-index for proper rendering

	// Log scene composition
	const depthCounts = new Map<number, number>();
	sortedBoxes.forEach((box) => {
		depthCounts.set(box.z, (depthCounts.get(box.z) || 0) + 1);
	});

	console.log(
		`🎨 Generated ${sortedBoxes.length} nodes across depths:`,
		Array.from(depthCounts.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([z, count]) => `Z${z >= 0 ? '+' : ''}${z}: ${count}`)
			.join(', ')
	);

	// Debug parallax factors for each depth
	console.log(
		`🔄 Parallax factors:`,
		Array.from(depthCounts.keys())
			.sort((a, b) => a - b)
			.map((z) => `Z${z >= 0 ? '+' : ''}${z}: ${getParallaxFactor(z).toFixed(2)}x`)
			.join(', ')
	);

	return sortedBoxes;
}

let boxes = $state<AppBoxState[]>(generateRandomBoxes());
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
	get animationDuration() {
		return animationDuration;
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
		animationDuration = 0; // No animation for panning
	},

	// Set the target viewport state (used by zooming action)
	setTargetViewport(target: { zoom: number; x: number; y: number }) {
		targetZoom = target.zoom;
		targetOffsetX = target.x;
		targetOffsetY = target.y;
		animationDuration = 0; // Raw zooming is not animated via store
	},

	// Set the target viewport state with smooth animation
	setTargetViewportAnimated(target: { zoom: number; x: number; y: number }, duration: number) {
		targetZoom = target.zoom;
		targetOffsetX = target.x;
		targetOffsetY = target.y;
		animationDuration = duration; // Animate the zoom
	},

	// Set the actual viewport state (used by animation loop)
	_setViewport(viewport: { zoom: number; x: number; y: number }) {
		zoom = viewport.zoom;
		offsetX = viewport.x;
		offsetY = viewport.y;
		if (zoomedBoxId !== null) {
			this.restorePreviousZoom();
		}
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
				// This behavior is now handled by the click handler in NodeContainer
				// this.zoomToBox(id, viewportWidth, viewportHeight);
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
		animationDuration = FOCUS_TRANSITION_DURATION; // Use the constant
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

		const { x, y, width, height, z } = box;

		// 1. Get the target zoom for the box's z-plane to be in focus.
		const newTargetZoom = getFocusZoomForZ(z);

		// 2. Calculate the center of the box in world coordinates
		const boxCenterX = x + width / 2;
		const boxCenterY = y + height / 2;

		// 3. Calculate initial offsets to center the box in the viewport
		let newTargetOffsetX = viewportWidth / 2 - boxCenterX * newTargetZoom;
		let newTargetOffsetY = viewportHeight / 2 - boxCenterY * newTargetZoom;

		// 4. Check for obstruction and adjust position if needed
		const obstructionResult = detectObstruction(
			box,
			boxes,
			newTargetZoom,
			newTargetOffsetX,
			newTargetOffsetY,
			viewportWidth,
			viewportHeight
		);

		if (obstructionResult.isObstructed) {
			console.log(
				`📦 Box ${boxId} is ${obstructionResult.obstructionPercentage.toFixed(1)}% obstructed by:`,
				obstructionResult.obstructingBoxes.map((b) => `Box ${b.id} (z=${b.z})`).join(', ')
			);

			const avoidanceApplied = !!obstructionResult.avoidanceVector;

			if (avoidanceApplied) {
				console.log(`🎯 Applying avoidance vector:`, obstructionResult.avoidanceVector);
				// Apply avoidance vector to offset
				newTargetOffsetX += obstructionResult.avoidanceVector.x;
				newTargetOffsetY += obstructionResult.avoidanceVector.y;
			}

			// Dispatch custom event for UI feedback
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('obstruction-detected', {
						detail: {
							percentage: obstructionResult.obstructionPercentage,
							obstructingBoxes: obstructionResult.obstructingBoxes.map((b) => `Box ${b.id}`),
							avoidanceApplied
						}
					})
				);
			}
		}

		// 5. Set the animation target in the store.
		targetZoom = newTargetZoom;
		targetOffsetX = newTargetOffsetX;
		targetOffsetY = newTargetOffsetY;
		animationDuration = FOCUS_TRANSITION_DURATION; // Use a constant for smooth animation
	},

	// Restore previous zoom level
	restorePreviousZoom() {
		if (zoomedBoxId === null) return;

		targetZoom = prevZoom;
		targetOffsetX = prevOffsetX;
		targetOffsetY = prevOffsetY;
		zoomedBoxId = null; // Clear the zoomed state
		animationDuration = FOCUS_TRANSITION_DURATION; // Use the constant
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
			animationDuration,
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
	},

	// Regenerate the scene with new random nodes
	regenerateScene() {
		boxes = generateRandomBoxes();
		selectedBoxId = null;
		lastSelectedBoxId = null;
		console.log(`🎲 Generated ${boxes.length} new nodes across depths -3 to +3`);
	}
};
