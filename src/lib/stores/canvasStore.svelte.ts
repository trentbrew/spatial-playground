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

// Helper function to check if two boxes overlap (with padding)
function boxesOverlap(
	box1: { x: number; y: number; width: number; height: number },
	box2: { x: number; y: number; width: number; height: number },
	padding: number = 20
): boolean {
	return !(
		box1.x + box1.width + padding < box2.x ||
		box2.x + box2.width + padding < box1.x ||
		box1.y + box1.height + padding < box2.y ||
		box2.y + box2.height + padding < box1.y
	);
}

// Find a non-overlapping position for a box at a specific Z level
function findNonOverlappingPosition(
	targetBox: { width: number; height: number; z: number },
	existingBoxes: AppBoxState[],
	maxAttempts: number = 50,
	padding: number = 50
): { x: number; y: number } {
	const sameZBoxes = existingBoxes.filter((box) => box.z === targetBox.z);

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const x = (Math.random() - 0.5) * 4000; // X from -2000 to +2000
		const y = (Math.random() - 0.5) * 3000; // Y from -1500 to +1500

		const testPosition = { x, y, width: targetBox.width, height: targetBox.height };

		// Check if this position overlaps with any existing box at the same Z level
		const hasOverlap = sameZBoxes.some((existingBox) =>
			boxesOverlap(testPosition, existingBox, padding)
		);

		if (!hasOverlap) {
			return { x: Math.round(x), y: Math.round(y) };
		}
	}

	// Fallback: if we can't find a non-overlapping position, place it anyway
	// but log a warning
	console.warn(
		`⚠️ Could not find non-overlapping position for Z${targetBox.z} box after ${maxAttempts} attempts`
	);
	return {
		x: Math.round((Math.random() - 0.5) * 4000),
		y: Math.round((Math.random() - 0.5) * 3000)
	};
}

// Generate a rich, multi-layered scene with varied nodes and no overlaps per Z-level
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

	// Create a diverse set of nodes across different depths with collision avoidance
	for (let i = 1; i <= 25; i++) {
		const z = Math.floor(Math.random() * 4) - 3; // Z from -3 to 0

		// Vary sizes based on depth for visual interest
		const baseSize = z >= 0 ? 180 + Math.random() * 120 : 150 + Math.random() * 100;
		const width = baseSize + Math.random() * 80;
		const height = baseSize + Math.random() * 60;

		// Find a non-overlapping position for this box
		const position = findNonOverlappingPosition(
			{ width: Math.round(width), height: Math.round(height), z },
			boxes,
			50, // max attempts
			50 // padding between boxes (increased for better spacing)
		);

		const color = colors[Math.floor(Math.random() * colors.length)];
		const type = nodeTypes[Math.floor(Math.random() * nodeTypes.length)];

		// Create content based on type and depth
		let content = `${type.charAt(0).toUpperCase() + type.slice(1)} ${i}`;
		if (z < 0) content += ` (Depth ${Math.abs(z)})`;

		boxes.push({
			id: i,
			x: position.x,
			y: position.y,
			width: Math.round(width),
			height: Math.round(height),
			color,
			content,
			type: type as 'sticky' | 'image' | 'text' | 'code',
			z
		});
	}

	// Add a few strategic test nodes - all using collision avoidance
	// Background test node (non-overlapping)
	const testNode1Position = findNonOverlappingPosition(
		{ width: 220, height: 180, z: -1 },
		boxes,
		50,
		50
	);
	boxes.push({
		id: 26,
		x: testNode1Position.x,
		y: testNode1Position.y,
		width: 220,
		height: 180,
		color: '#FF6B6B',
		content: 'Focus Test Node',
		type: 'sticky',
		z: -1 // Background - will zoom in to 1.67x
	});

	// Foreground test nodes (using collision avoidance)
	const testNode2Position = findNonOverlappingPosition(
		{ width: 160, height: 140, z: 0 },
		boxes,
		50,
		50
	);
	boxes.push({
		id: 27,
		x: testNode2Position.x,
		y: testNode2Position.y,
		width: 160,
		height: 140,
		color: '#4ECDC4',
		content: 'Front Node',
		type: 'image',
		z: 0 // Foreground - will zoom in to 1.5x
	});

	const testNode3Position = findNonOverlappingPosition(
		{ width: 180, height: 120, z: 0 },
		boxes,
		50,
		50
	);
	boxes.push({
		id: 28,
		x: testNode3Position.x,
		y: testNode3Position.y,
		width: 180,
		height: 120,
		color: '#45B7D1',
		content: 'Another Node',
		type: 'text',
		z: 0 // Foreground - will zoom in to 1.5x
	});

	// Add a special test node at Z=0 for testing boundary hit
	const boundaryTestPosition = findNonOverlappingPosition(
		{ width: 200, height: 150, z: 0 },
		boxes,
		50,
		50
	);
	boxes.push({
		id: 29,
		x: boundaryTestPosition.x,
		y: boundaryTestPosition.y,
		width: 200,
		height: 150,
		color: '#FF6B9D',
		content: 'Z-Boundary Test (try Cmd+] to hit screen!)',
		type: 'sticky',
		z: 0 // At the boundary - perfect for testing
	});

	const sortedBoxes = boxes.sort((a, b) => a.z - b.z); // Sort by z-index for proper rendering

	// Log scene composition
	const depthCounts = new Map<number, number>();
	sortedBoxes.forEach((box) => {
		depthCounts.set(box.z, (depthCounts.get(box.z) || 0) + 1);
	});

	console.log(
		`🎨 Generated ${sortedBoxes.length} nodes across depths (Z-3 to Z0):`,
		Array.from(depthCounts.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([z, count]) => `Z${z}: ${count}`)
			.join(', ')
	);

	// Report collision avoidance results
	const overlapCounts = new Map<number, number>();
	depthCounts.forEach((count, z) => {
		const nodesAtZ = sortedBoxes.filter((box) => box.z === z);
		let overlaps = 0;
		for (let i = 0; i < nodesAtZ.length; i++) {
			for (let j = i + 1; j < nodesAtZ.length; j++) {
				if (boxesOverlap(nodesAtZ[i], nodesAtZ[j], 0)) {
					overlaps++;
				}
			}
		}
		overlapCounts.set(z, overlaps);
	});

	const totalOverlaps = Array.from(overlapCounts.values()).reduce((sum, count) => sum + count, 0);
	console.log(
		`🚫 Collision avoidance results: ${totalOverlaps} overlaps remaining`,
		totalOverlaps > 0
			? Array.from(overlapCounts.entries())
					.filter(([z, count]) => count > 0)
					.map(([z, count]) => `Z${z}: ${count}`)
					.join(', ')
			: '(perfect spacing achieved!)'
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
let draggingBoxId = $state<number | null>(null);
let ghostedBoxIds = $state<Set<number>>(new Set());
let boundaryHitBoxId = $state<number | null>(null); // Track which box hit the Z-boundary

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
	get draggingBoxId() {
		return draggingBoxId;
	},
	get ghostedBoxIds() {
		return ghostedBoxIds;
	},
	get boundaryHitBoxId() {
		return boundaryHitBoxId;
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
	},

	// Add a new box to the canvas with optional collision avoidance
	addBox(box: AppBoxState, avoidOverlaps: boolean = true) {
		if (avoidOverlaps) {
			// Find a non-overlapping position for the new box
			const position = findNonOverlappingPosition(
				{ width: box.width, height: box.height, z: box.z },
				boxes,
				50, // max attempts
				50 // padding (increased for better spacing)
			);

			// Create the final box with the collision-free position
			const finalBox = { ...box, x: position.x, y: position.y };
			boxes.push(finalBox);
		} else {
			boxes.push(box);
		}
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

			// Clear any ghosted nodes when deselecting
			this.clearGhostedNodes();

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

	// Zoom to a specific box with padding - ensuring perfect centering
	zoomToBox(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) return;

		const { x, y, width, height, z } = box;

		// Store previous zoom state before starting transition
		if (zoomedBoxId === null) {
			prevZoom = zoom;
			prevOffsetX = offsetX;
			prevOffsetY = offsetY;
		}
		zoomedBoxId = boxId;

		// 1. Calculate the center of the box in world coordinates
		const boxCenterX = x + width / 2;
		const boxCenterY = y + height / 2;

		// 2. Get the target zoom for the box's z-plane to be in focus
		const newTargetZoom = getFocusZoomForZ(z);

		// 3. Calculate offsets to perfectly center the box at the target zoom level
		// Formula: to center point P at zoom Z in viewport of size V:
		// offset = (viewport_center) - (world_point * zoom)
		let newTargetOffsetX = viewportWidth / 2 - boxCenterX * newTargetZoom;
		let newTargetOffsetY = viewportHeight / 2 - boxCenterY * newTargetZoom;

		console.log(
			`🎯 Zoom to Box ${boxId}:`,
			`\n  Box: (${x}, ${y}) ${width}x${height} Z:${z}`,
			`\n  Box Center: (${boxCenterX.toFixed(1)}, ${boxCenterY.toFixed(1)})`,
			`\n  Viewport: ${viewportWidth}x${viewportHeight}`,
			`\n  Viewport Center: (${(viewportWidth / 2).toFixed(1)}, ${(viewportHeight / 2).toFixed(1)})`,
			`\n  Current: zoom=${zoom.toFixed(2)} offset=(${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`,
			`\n  Target: zoom=${newTargetZoom.toFixed(2)} offset=(${newTargetOffsetX.toFixed(1)}, ${newTargetOffsetY.toFixed(1)})`
		);

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

		// 5. Set the animation target in the store
		targetZoom = newTargetZoom;
		targetOffsetX = newTargetOffsetX;
		targetOffsetY = newTargetOffsetY;
		animationDuration = FOCUS_TRANSITION_DURATION; // Use a constant for smooth animation

		// 6. Verify the calculation by checking where the box center will appear after animation
		const finalBoxScreenX = boxCenterX * newTargetZoom + newTargetOffsetX;
		const finalBoxScreenY = boxCenterY * newTargetZoom + newTargetOffsetY;
		const expectedCenterX = viewportWidth / 2;
		const expectedCenterY = viewportHeight / 2;

		console.log(
			`📐 Verification: Box center will appear at screen (${finalBoxScreenX.toFixed(1)}, ${finalBoxScreenY.toFixed(1)})`,
			`\n  Expected center: (${expectedCenterX.toFixed(1)}, ${expectedCenterY.toFixed(1)})`,
			`\n  Error: (${(finalBoxScreenX - expectedCenterX).toFixed(1)}, ${(finalBoxScreenY - expectedCenterY).toFixed(1)})`
		);
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

	// Z-axis management functions with zoom following and boundary enforcement
	moveBoxForward(boxId: number, viewportWidth?: number, viewportHeight?: number) {
		const boxIndex = boxes.findIndex((box) => box.id === boxId);
		if (boxIndex !== -1) {
			const oldZ = boxes[boxIndex].z;
			const newZ = oldZ + 1;

			// Check Z-axis boundary - prevent going above Z=0 (screen surface)
			if (newZ > 0) {
				console.log(`🚫 Box ${boxId} hit the screen surface! Cannot move beyond Z=0`);
				// Trigger boundary hit effect
				this.triggerBoundaryHit(boxId);
				return; // Don't move the box
			}

			boxes[boxIndex] = {
				...boxes[boxIndex],
				z: newZ
			};

			// If viewport dimensions are provided, smoothly zoom to the new focus level
			if (viewportWidth && viewportHeight) {
				const newFocusZoom = getFocusZoomForZ(newZ);
				const box = boxes[boxIndex];

				// Calculate center position for smooth transition
				const boxCenterX = box.x + box.width / 2;
				const boxCenterY = box.y + box.height / 2;

				// Center the box at the new zoom level
				const newTargetOffsetX = viewportWidth / 2 - boxCenterX * newFocusZoom;
				const newTargetOffsetY = viewportHeight / 2 - boxCenterY * newFocusZoom;

				// Set smooth animation targets
				targetZoom = newFocusZoom;
				targetOffsetX = newTargetOffsetX;
				targetOffsetY = newTargetOffsetY;
				animationDuration = 250; // Smooth transition

				// Update ghosting after a brief delay to let the zoom settle
				setTimeout(() => {
					this.checkAndGhostObstructors(boxId, viewportWidth, viewportHeight);
				}, 100);

				console.log(
					`📈 Moving Box ${boxId} forward: Z${oldZ} → Z${newZ}, zoom: ${zoom.toFixed(2)} → ${newFocusZoom.toFixed(2)}`
				);
			}
		}
	},

	moveBoxBackward(boxId: number, viewportWidth?: number, viewportHeight?: number) {
		const boxIndex = boxes.findIndex((box) => box.id === boxId);
		if (boxIndex !== -1) {
			const oldZ = boxes[boxIndex].z;
			const newZ = oldZ - 1;

			boxes[boxIndex] = {
				...boxes[boxIndex],
				z: newZ
			};

			// If viewport dimensions are provided, smoothly zoom to the new focus level
			if (viewportWidth && viewportHeight) {
				const newFocusZoom = getFocusZoomForZ(newZ);
				const box = boxes[boxIndex];

				// Calculate center position for smooth transition
				const boxCenterX = box.x + box.width / 2;
				const boxCenterY = box.y + box.height / 2;

				// Center the box at the new zoom level
				const newTargetOffsetX = viewportWidth / 2 - boxCenterX * newFocusZoom;
				const newTargetOffsetY = viewportHeight / 2 - boxCenterY * newFocusZoom;

				// Set smooth animation targets
				targetZoom = newFocusZoom;
				targetOffsetX = newTargetOffsetX;
				targetOffsetY = newTargetOffsetY;
				animationDuration = 250; // Smooth transition

				// Update ghosting after a brief delay to let the zoom settle
				setTimeout(() => {
					this.checkAndGhostObstructors(boxId, viewportWidth, viewportHeight);
				}, 100);

				console.log(
					`📉 Moving Box ${boxId} backward: Z${oldZ} → Z${newZ}, zoom: ${zoom.toFixed(2)} → ${newFocusZoom.toFixed(2)}`
				);
			}
		}
	},

	// Move selected box forward (Cmd+]) with zoom following
	moveSelectedForward(viewportWidth?: number, viewportHeight?: number) {
		if (selectedBoxId !== null) {
			canvasStore.moveBoxForward(selectedBoxId, viewportWidth, viewportHeight);
		}
	},

	// Move selected box backward (Cmd+[) with zoom following
	moveSelectedBackward(viewportWidth?: number, viewportHeight?: number) {
		if (selectedBoxId !== null) {
			canvasStore.moveBoxBackward(selectedBoxId, viewportWidth, viewportHeight);
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
		draggingBoxId = null;
		console.log(`🎲 Generated ${boxes.length} new nodes across depths Z-3 to Z0`);
	},

	// Set dragging state for parallax suspension
	setDragging(boxId: number | null) {
		if (boxId !== null) {
			console.log(`🎯 Suspending parallax for Box ${boxId} during drag`);
		} else {
			console.log(`🔄 Restoring parallax after drag completion`);
		}
		draggingBoxId = boxId;
	},

	// Force clear dragging state (for debugging/emergency cleanup)
	clearDragging() {
		if (draggingBoxId !== null) {
			console.log(`🧹 Force clearing dragging state for Box ${draggingBoxId}`);
			draggingBoxId = null;
		}
	},

	// Center a box in the viewport with smooth animation
	centerBox(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) return;

		// Calculate the center of the box in world coordinates
		const boxCenterX = box.x + box.width / 2;
		const boxCenterY = box.y + box.height / 2;

		// Calculate offsets to center the box in the viewport at current zoom
		const newTargetOffsetX = viewportWidth / 2 - boxCenterX * zoom;
		const newTargetOffsetY = viewportHeight / 2 - boxCenterY * zoom;

		// Set the animation target for smooth centering
		targetOffsetX = newTargetOffsetX;
		targetOffsetY = newTargetOffsetY;
		animationDuration = 200; // Smooth but quick centering animation

		console.log(`🎯 Centering Box ${boxId} at zoom ${zoom.toFixed(2)}`);
	},

	// Check for obstruction and ghost blocking nodes
	checkAndGhostObstructors(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) return;

		// Use the obstruction detection system
		const obstructionResult = detectObstruction(
			box,
			boxes,
			zoom,
			offsetX,
			offsetY,
			viewportWidth,
			viewportHeight
		);

		// Clear previous ghosted nodes
		ghostedBoxIds.clear();

		if (obstructionResult.isObstructed && obstructionResult.obstructingBoxes.length > 0) {
			// Ghost the obstructing boxes
			obstructionResult.obstructingBoxes.forEach((obstructingBox) => {
				ghostedBoxIds.add(obstructingBox.id);
			});

			console.log(
				`👻 Ghosting ${obstructionResult.obstructingBoxes.length} obstructing boxes:`,
				obstructionResult.obstructingBoxes.map((b) => `Box ${b.id}`).join(', ')
			);

			// Trigger reactivity by creating a new Set
			ghostedBoxIds = new Set(ghostedBoxIds);
		} else {
			// If no obstructions, make sure ghosted nodes are cleared
			console.log('✨ No obstructions found, clearing any ghosted nodes');
			// Trigger reactivity even when clearing
			ghostedBoxIds = new Set(ghostedBoxIds);
		}
	},

	// Refresh ghosting for the currently selected box (call this when view changes)
	refreshGhosting(viewportWidth: number, viewportHeight: number) {
		if (selectedBoxId !== null) {
			this.checkAndGhostObstructors(selectedBoxId, viewportWidth, viewportHeight);
		}
	},

	// Clear all ghosted nodes
	clearGhostedNodes() {
		if (ghostedBoxIds.size > 0) {
			console.log('✨ Clearing all ghosted nodes');
			ghostedBoxIds.clear();
			ghostedBoxIds = new Set(ghostedBoxIds); // Trigger reactivity
		}
	},

	// Set zoom level directly (for slider)
	setZoom(newZoom: number) {
		const clampedZoom = Math.max(0.1, Math.min(10, newZoom)); // Clamp between 0.1x and 10x
		zoom = clampedZoom;
		targetZoom = clampedZoom;
		console.log(`🔍 Zoom set to ${clampedZoom.toFixed(2)}x via slider`);
	},

	// Called when view changes to refresh ghosting if needed
	onViewChange(viewportWidth: number, viewportHeight: number) {
		this.refreshGhosting(viewportWidth, viewportHeight);
	},

	// Trigger boundary hit effect when node hits screen surface (Z=0)
	triggerBoundaryHit(boxId: number) {
		// Set the boundary hit state for visual feedback
		boundaryHitBoxId = boxId;

		// Play the plunk sound effect
		try {
			const audio = new Audio('/audio/plunk3.wav');
			audio.volume = 0.3; // Keep it subtle
			audio.play().catch(console.warn); // Ignore audio play errors
		} catch (error) {
			console.warn('Could not play boundary hit sound:', error);
		}

		// Clear the boundary hit state after animation
		setTimeout(() => {
			boundaryHitBoxId = null;
		}, 500); // 500ms flash duration

		console.log(`💥 Box ${boxId} hit the Z-boundary with visual and audio feedback`);
	}
};
