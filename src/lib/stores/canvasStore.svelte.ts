import type { AppBoxState } from '$lib/canvasState';
import {
	FOCUS_TRANSITION_DURATION,
	FOCAL_PLANE_TARGET_SCALE,
	DOF_SHARPNESS_FACTOR
} from '$lib/constants';
import { getIntrinsicScaleFactor, getFocusZoomForZ, getParallaxFactor } from '$lib/utils/depth';
import { detectObstruction } from '$lib/utils/obstruction';
import { writable } from 'svelte/store';
import {
	turtleDbStore,
	addNode as dbAddNode,
	updateNode as dbUpdateNode,
	deleteNode as dbDeleteNode,
	loadNodes as dbLoadNodes
} from '$lib/stores/turtleDbStore';

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

// Interaction state
let apertureEnabled = $state(true);

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

// Improved grid-based collision detection for better node placement
function findNonOverlappingPosition(
	targetBox: { width: number; height: number; z: number },
	existingBoxes: AppBoxState[],
	maxAttempts: number = 100,
	padding: number = 60
): { x: number; y: number } {
	// Check overlaps across ALL Z-levels for visual clarity
	const allBoxes = existingBoxes;

	// Try a grid-based approach first for better distribution
	const gridSize = 300; // Grid cell size
	const gridCols = 20; // 20 columns
	const gridRows = 15; // 15 rows
	const startX = -3000; // Start from left edge
	const startY = -2250; // Start from top edge

	// Create a list of grid positions and shuffle them for variety
	const gridPositions: { x: number; y: number }[] = [];
	for (let row = 0; row < gridRows; row++) {
		for (let col = 0; col < gridCols; col++) {
			const x = startX + col * gridSize + Math.random() * 100 - 50; // Add some jitter
			const y = startY + row * gridSize + Math.random() * 100 - 50; // Add some jitter
			gridPositions.push({ x, y });
		}
	}

	// Shuffle the grid positions for variety
	for (let i = gridPositions.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[gridPositions[i], gridPositions[j]] = [gridPositions[j], gridPositions[i]];
	}

	// First try grid positions
	for (const position of gridPositions) {
		const testPosition = {
			x: position.x,
			y: position.y,
			width: targetBox.width,
			height: targetBox.height
		};

		// Check if this position overlaps with any existing box across all Z-levels
		const hasOverlap = allBoxes.some((existingBox) =>
			boxesOverlap(testPosition, existingBox, padding)
		);

		if (!hasOverlap) {
			return { x: Math.round(position.x), y: Math.round(position.y) };
		}
	}

	// If grid approach fails, try random positions with increased attempts
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const x = (Math.random() - 0.5) * 5000; // Expanded X range: -2500 to +2500
		const y = (Math.random() - 0.5) * 4000; // Expanded Y range: -2000 to +2000

		const testPosition = { x, y, width: targetBox.width, height: targetBox.height };

		// Check if this position overlaps with any existing box across all Z-levels
		const hasOverlap = allBoxes.some((existingBox) =>
			boxesOverlap(testPosition, existingBox, padding)
		);

		if (!hasOverlap) {
			return { x: Math.round(x), y: Math.round(y) };
		}
	}

	// Enhanced fallback: try to find the least overlapping position
	let bestPosition = { x: 0, y: 0 };
	let minOverlaps = Infinity;

	for (let attempt = 0; attempt < 50; attempt++) {
		const x = (Math.random() - 0.5) * 6000; // Even wider range for fallback
		const y = (Math.random() - 0.5) * 5000;

		const testPosition = { x, y, width: targetBox.width, height: targetBox.height };

		// Count overlaps for this position
		const overlapCount = allBoxes.filter((existingBox) =>
			boxesOverlap(testPosition, existingBox, padding)
		).length;

		if (overlapCount < minOverlaps) {
			minOverlaps = overlapCount;
			bestPosition = { x: Math.round(x), y: Math.round(y) };
		}

		// If we found a position with minimal overlaps, use it
		if (overlapCount <= 1) break;
	}

	if (minOverlaps > 0) {
		console.warn(
			`⚠️ Could not find completely non-overlapping position for Z${targetBox.z} box, using position with ${minOverlaps} overlaps`
		);
	}

	return bestPosition;
}

// Helper function to load an image and get its dimensions
function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => {
			console.warn(`Failed to load image: ${src}`);
			// Fallback to a default aspect ratio if image fails to load
			resolve({ width: 400, height: 300 });
		};
		img.src = src;
	});
}

// Generate a rich, multi-layered scene with varied nodes and no overlaps per Z-level
async function generateRandomBoxes(): Promise<AppBoxState[]> {
	// Use consistent dark gray for all nodes
	const defaultColor = '#2a2a2a';

	// List of all artwork files in the assets/artwork directory
	const artworkFiles = [
		'20220206_110313.jpg',
		'a-good-day.png',
		'alien.jpg',
		'an.png',
		'angel.jpg',
		'bot.png',
		'brewcrewtew.png',
		'buds.png',
		'clipprs.png',
		'dancer.png',
		'digest.jpg',
		'efervesence.png',
		'halfpipe.png',
		'haus Medium.png',
		'haus.png',
		'her Medium Small.png',
		'her.jpg',
		'her2.png',
		'hug.jpg',
		'IMG_0191.jpg',
		'IMG_0292.PNG',
		'IMG_0293.PNG',
		'IMG_0294.PNG',
		'IMG_0779.webp',
		'isabella.jpg',
		'jazz.jpg',
		'overcast Medium.png',
		'overcast.png',
		'point.png',
		'point2.png',
		'progress.jpg',
		'scholar.jpg',
		'skateboard.jpg',
		'sonic.jpg',
		'spill.jpg',
		'spill (1).jpg',
		'stares.jpg',
		'strand.jpg',
		'string_invert_2.png',
		'strings_invert.png',
		'summer18.jpg',
		'symmetry.png',
		'thedaancer.png',
		'Untitled_Artwork.png',
		'uptime2.png',
		'weight.jpg'
	];

	const boxes: AppBoxState[] = [];

	// Load all images and get their dimensions
	console.log('🖼️ Loading image dimensions for aspect ratio matching...');
	const imageDataPromises = artworkFiles.map(async (filename, index) => {
		const imagePath = `/artwork/${filename}`;
		const dimensions = await loadImageDimensions(imagePath);
		return { filename, imagePath, dimensions, index };
	});

	const imageDataArray = await Promise.all(imageDataPromises);
	console.log(`📐 Loaded dimensions for ${imageDataArray.length} images`);

	// Create image nodes for each artwork file with correct aspect ratios
	imageDataArray.forEach(({ filename, imagePath, dimensions, index }) => {
		const id = index + 1;

		// Distribute across different Z depths for visual interest
		const z = Math.floor(Math.random() * 4) - 3; // Z from -3 to 0

		// Calculate dimensions based on depth and actual image aspect ratio
		// Deeper items (negative Z) are slightly smaller, foreground items larger
		const baseSize = z >= 0 ? 400 + Math.random() * 200 : 360 + Math.random() * 150;

		// Use the actual aspect ratio of the image
		const actualAspectRatio = dimensions.width / dimensions.height;

		// Determine final dimensions while maintaining aspect ratio
		let finalWidth, finalHeight;

		if (actualAspectRatio > 1) {
			// Landscape: width is the limiting factor
			finalWidth = Math.round(baseSize);
			finalHeight = Math.round(baseSize / actualAspectRatio);
		} else {
			// Portrait or square: height is the limiting factor
			finalHeight = Math.round(baseSize);
			finalWidth = Math.round(baseSize * actualAspectRatio);
		}

		// Ensure dimensions stay within reasonable bounds
		finalWidth = Math.min(Math.max(finalWidth, 360), 800);
		finalHeight = Math.min(Math.max(finalHeight, 270), 600);

		// If we hit the bounds, recalculate to maintain aspect ratio
		if (finalWidth === 360 || finalWidth === 800) {
			finalHeight = Math.round(finalWidth / actualAspectRatio);
			finalHeight = Math.min(Math.max(finalHeight, 270), 600);
		}
		if (finalHeight === 270 || finalHeight === 600) {
			finalWidth = Math.round(finalHeight * actualAspectRatio);
			finalWidth = Math.min(Math.max(finalWidth, 360), 800);
		}

		// Find a non-overlapping position for this image
		const position = findNonOverlappingPosition(
			{ width: finalWidth, height: finalHeight, z },
			boxes,
			100, // max attempts (increased)
			80 // padding between images (increased for better spacing)
		);

		boxes.push({
			id,
			x: position.x,
			y: position.y,
			width: finalWidth,
			height: finalHeight,
			color: defaultColor,
			content: imagePath, // Use the image path as content
			type: 'image',
			z
		});
	});

	const sortedBoxes = boxes.sort((a, b) => a.z - b.z); // Sort by z-index for proper rendering

	// Log scene composition
	const depthCounts = new Map<number, number>();
	sortedBoxes.forEach((box) => {
		depthCounts.set(box.z, (depthCounts.get(box.z) || 0) + 1);
	});

	console.log(
		`🖼️ Generated ${sortedBoxes.length} artwork images with natural aspect ratios across depths (Z-3 to Z0):`,
		Array.from(depthCounts.entries())
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

let boxes = $state([]);
let selectedBoxId = $state<number | null>(null);
let lastSelectedBoxId = $state<number | null>(null);
let draggingBoxId = $state<number | null>(null);
let ghostedBoxIds = $state<Set<number>>(new Set());
let boundaryHitBoxId = $state<number | null>(null); // Track which box hit the Z-boundary

// --- On module load, load all nodes from TurtleDB ---
dbLoadNodes().then(() => {
	turtleDbStore.subscribe((dbBoxes) => {
		boxes = dbBoxes.map((node) => ({ ...node }));
	});
});

// --- Update addBox, updateBox, deleteBox to use TurtleDB ---
function addBox(box: AppBoxState) {
	dbAddNode(box.type, box).then(() => dbLoadNodes());
}

function updateBox(id: number, partial: Partial<AppBoxState>) {
	dbUpdateNode(id, partial).then(() => dbLoadNodes());
}

function deleteBox(id: number) {
	dbDeleteNode(id).then(() => dbLoadNodes());
}

// --- Listen for TurtleDB node events and refresh boxes ---
// (Already handled by turtleDbStore subscription above)

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
	get apertureEnabled() {
		return apertureEnabled;
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

			// Clear zoomed state but keep the current zoom level (don't auto zoom-out)
			// Users can manually zoom out if they want to
			zoomedBoxId = null;
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

		// 3. Account for parallax and intrinsic scaling effects
		// Use the same depth utilities that are used in rendering
		const parallaxFactor = getParallaxFactor(z);
		const intrinsicScale = getIntrinsicScaleFactor(z);
		const effectiveScale = newTargetZoom * intrinsicScale;

		// 4. Calculate offsets accounting for parallax effects
		// The parallax correction needs to be considered in the centering calculation
		const parallaxCorrectionX = (viewportWidth / 2) * (1 - parallaxFactor);
		const parallaxCorrectionY = (viewportHeight / 2) * (1 - parallaxFactor);

		// Calculate the base offset needed to center the box
		const baseOffsetX = viewportWidth / 2 - boxCenterX * effectiveScale;
		const baseOffsetY = viewportHeight / 2 - boxCenterY * effectiveScale;

		// Apply inverse parallax correction to the base offset
		let newTargetOffsetX = (baseOffsetX - parallaxCorrectionX) / parallaxFactor;
		let newTargetOffsetY = (baseOffsetY - parallaxCorrectionY) / parallaxFactor;

		console.log(
			`🎯 Zoom to Box ${boxId} with Parallax Correction:`,
			`\n  Box: (${x}, ${y}) ${width}x${height} Z:${z}`,
			`\n  Box Center: (${boxCenterX.toFixed(1)}, ${boxCenterY.toFixed(1)})`,
			`\n  Viewport: ${viewportWidth}x${viewportHeight}`,
			`\n  Viewport Center: (${(viewportWidth / 2).toFixed(1)}, ${(viewportHeight / 2).toFixed(1)})`,
			`\n  Depth Effects: Parallax=${parallaxFactor.toFixed(3)}, Intrinsic=${intrinsicScale.toFixed(3)}, Effective=${effectiveScale.toFixed(3)}`,
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
		// Apply the same parallax and scaling transformations that will be used in rendering
		const finalParallaxOffsetX = newTargetOffsetX * parallaxFactor + parallaxCorrectionX;
		const finalParallaxOffsetY = newTargetOffsetY * parallaxFactor + parallaxCorrectionY;
		const finalBoxScreenX = boxCenterX * effectiveScale + finalParallaxOffsetX;
		const finalBoxScreenY = boxCenterY * effectiveScale + finalParallaxOffsetY;
		const expectedCenterX = viewportWidth / 2;
		const expectedCenterY = viewportHeight / 2;

		console.log(
			`📐 Enhanced Verification: Box center will appear at screen (${finalBoxScreenX.toFixed(1)}, ${finalBoxScreenY.toFixed(1)})`,
			`\n  Expected center: (${expectedCenterX.toFixed(1)}, ${expectedCenterY.toFixed(1)})`,
			`\n  Error: (${(finalBoxScreenX - expectedCenterX).toFixed(1)}, ${(finalBoxScreenY - expectedCenterY).toFixed(1)})`,
			`\n  Z: ${z}, Parallax: ${parallaxFactor.toFixed(3)}, IntrinsicScale: ${intrinsicScale.toFixed(3)}, EffectiveScale: ${effectiveScale.toFixed(3)}`
		);
	},

	// Restore previous zoom level
	restorePreviousZoom() {
		if (zoomedBoxId === null) return;

		console.log(`🔍 Restoring previous zoom: ${zoom.toFixed(2)} → ${prevZoom.toFixed(2)}`);

		// Clear the zoomed state first to prevent recursion
		zoomedBoxId = null;

		// Restore the previous zoom and viewport position
		targetZoom = prevZoom;
		targetOffsetX = prevOffsetX;
		targetOffsetY = prevOffsetY;
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
			apertureEnabled,
			boxes,
			selectedBoxId,
			lastSelectedBoxId,
			draggingBoxId,
			ghostedBoxIds
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
	async regenerateScene() {
		console.log('🖼️ Starting artwork gallery generation...');
		boxes = await generateRandomBoxes();
		selectedBoxId = null;
		lastSelectedBoxId = null;
		draggingBoxId = null;
		console.log(
			`🎨 Generated ${boxes.length} artwork images with natural aspect ratios across depths Z-3 to Z0`
		);
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

		// Check if we should auto-unfocus when zooming away from a focused node
		if (zoomedBoxId !== null) {
			const focusedBox = boxes.find((b) => b.id === zoomedBoxId);
			if (focusedBox) {
				const expectedFocusZoom = getFocusZoomForZ(focusedBox.z);
				const zoomThreshold = expectedFocusZoom * 0.8; // 80% of expected focus zoom

				// If user zooms significantly away from focus zoom, treat as unfocus (like clicking outside)
				if (clampedZoom < zoomThreshold) {
					console.log(
						`🔍 Auto-unfocusing Box ${zoomedBoxId} - zoom ${clampedZoom.toFixed(2)} below threshold ${zoomThreshold.toFixed(2)}`
					);

					// Clear the focused state without additional zoom changes to avoid recursion
					const previousZoomedBoxId = zoomedBoxId;
					zoomedBoxId = null;

					// Continue with the user's requested zoom level
					zoom = clampedZoom;
					targetZoom = clampedZoom;
					console.log(
						`🔍 Zoom set to ${clampedZoom.toFixed(2)}x with unfocus of Box ${previousZoomedBoxId}`
					);
					return;
				}
			}
		}

		zoom = clampedZoom;
		targetZoom = clampedZoom;
		console.log(`🔍 Zoom set to ${clampedZoom.toFixed(2)}x via slider`);
	},

	// Unfocus the current node with a slight zoom out for visual feedback
	unfocusNode() {
		if (zoomedBoxId === null) return;

		console.log(`🔍 Unfocusing node ${zoomedBoxId}`);

		// Clear the zoomed state and restore previous zoom level
		const wasZoomedBoxId = zoomedBoxId;
		zoomedBoxId = null;

		// Restore the previous zoom and viewport position
		targetZoom = prevZoom;
		targetOffsetX = prevOffsetX;
		targetOffsetY = prevOffsetY;
		animationDuration = FOCUS_TRANSITION_DURATION;

		console.log(
			`🔍 Unfocused Box ${wasZoomedBoxId}, restoring zoom: ${zoom.toFixed(2)} → ${prevZoom.toFixed(2)}`
		);
	},

	// Called when view changes to refresh ghosting if needed
	onViewChange(viewportWidth: number, viewportHeight: number) {
		if (selectedBoxId) {
			this.checkAndGhostObstructors(selectedBoxId, viewportWidth, viewportHeight);
		}
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
	},

	// --- New Actions ---
	toggleAperture() {
		apertureEnabled = !apertureEnabled;
	},

	// Clear all boxes and reset selection state for a blank scene
	clearScene() {
		boxes = [];
		selectedBoxId = null;
		lastSelectedBoxId = null;
		draggingBoxId = null;
		ghostedBoxIds = new Set();
		boundaryHitBoxId = null;
		fullscreenBoxId = null;
		zoomedBoxId = null;
		// Optionally reset zoom and offsets to defaults
		zoom = 1;
		offsetX = 0;
		offsetY = 0;
		targetZoom = 1;
		targetOffsetX = 0;
		targetOffsetY = 0;
		// Log for debugging
		console.log('🧹 Scene cleared: all boxes removed and state reset');
	},

	// Delete a box by ID
	deleteBox(id: number) {
		deleteBox(id);
	}
};

export function toggleAperture() {
	apertureEnabled = !apertureEnabled;
}
