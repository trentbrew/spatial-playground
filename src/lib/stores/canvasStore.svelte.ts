import type { AppBoxState } from '$lib/canvasState';
import {
	FOCUS_TRANSITION_DURATION,
	FOCAL_PLANE_TARGET_SCALE,
	DOF_SHARPNESS_FACTOR
} from '$lib/constants';
import { getIntrinsicScaleFactor, getFocusZoomForZ, getParallaxFactor } from '$lib/utils/depth';
import { detectObstruction } from '$lib/utils/obstruction';
import { writable } from 'svelte/store';
import { canvasZeroAdapter } from '$lib/stores/canvasZeroAdapter';
import { zoom, offsetX, offsetY } from '$lib/stores/viewportStore';
import { get } from 'svelte/store';

// --- Animation Helper for Smooth Zoom/Pan ---
let zoomPanAnimationFrame: number | null = null;
let isAnimatingZoomPan = false; // Guard to prevent recursive calls

function smoothZoomPan(
	targetZoom: number,
	targetOffsetX: number,
	targetOffsetY: number,
	duration = 600
) {
	// Prevent recursive animation calls
	if (isAnimatingZoomPan) {
		console.warn('🔄 Animation already in progress, skipping new animation request');
		return;
	}

	// Cancel any existing animation
	if (zoomPanAnimationFrame) {
		cancelAnimationFrame(zoomPanAnimationFrame);
		zoomPanAnimationFrame = null;
	}

	// Get initial values once at the start
	const startZoom = get(zoom);
	const startOffsetX = get(offsetX);
	const startOffsetY = get(offsetY);
	const startTime = performance.now();

	// Early exit if we're already at the target
	const zoomDiff = Math.abs(targetZoom - startZoom);
	const offsetXDiff = Math.abs(targetOffsetX - startOffsetX);
	const offsetYDiff = Math.abs(targetOffsetY - startOffsetY);

	if (zoomDiff < 0.001 && offsetXDiff < 1 && offsetYDiff < 1) {
		console.log('📍 Already at target position, skipping animation');
		return;
	}

	isAnimatingZoomPan = true;
	console.log('🎬 Starting smooth zoom/pan animation', {
		from: { zoom: startZoom, x: startOffsetX, y: startOffsetY },
		to: { zoom: targetZoom, x: targetOffsetX, y: targetOffsetY },
		duration
	});

	function animate(now: number) {
		if (!isAnimatingZoomPan) {
			// Animation was cancelled
			zoomPanAnimationFrame = null;
			return;
		}

		const elapsed = now - startTime;
		const t = Math.min(elapsed / duration, 1);

		// Smooth ease-in-out
		const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

		const currentZoom = startZoom + (targetZoom - startZoom) * eased;
		const currentOffsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
		const currentOffsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;

		// Update stores in a non-reactive way to prevent cycles
		try {
			zoom.set(currentZoom);
			offsetX.set(currentOffsetX);
			offsetY.set(currentOffsetY);
		} catch (error) {
			console.error('❌ Error updating zoom/pan stores:', error);
			isAnimatingZoomPan = false;
			zoomPanAnimationFrame = null;
			return;
		}

		if (t < 1) {
			zoomPanAnimationFrame = requestAnimationFrame(animate);
		} else {
			// Animation complete
			console.log('✅ Smooth zoom/pan animation completed');
			isAnimatingZoomPan = false;
			zoomPanAnimationFrame = null;
		}
	}

	zoomPanAnimationFrame = requestAnimationFrame(animate);
}

// Function to cancel any ongoing animation
function cancelZoomPanAnimation() {
	if (zoomPanAnimationFrame) {
		cancelAnimationFrame(zoomPanAnimationFrame);
		zoomPanAnimationFrame = null;
	}
	isAnimatingZoomPan = false;
}

// Helper to compare two box arrays for meaningful changes
function haveBoxesChanged(oldBoxes: AppBoxState[], newZeroNodes: any[]): boolean {
	if (oldBoxes.length !== newZeroNodes.length) {
		return true; // Length changed
	}

	// Create a map of old boxes for quick lookup
	const oldBoxMap = new Map(oldBoxes.map((b) => [b.id, b]));

	for (const zeroNode of newZeroNodes) {
		const id = parseInt(zeroNode.id);
		const oldBox = oldBoxMap.get(id);

		if (!oldBox) {
			return true; // A new box was added
		}

		// Check for changes in key properties that affect layout.
		// NOTE: Does not check `content` for performance reasons.
		if (
			oldBox.x !== zeroNode.x ||
			oldBox.y !== zeroNode.y ||
			oldBox.width !== zeroNode.width ||
			oldBox.height !== zeroNode.height ||
			oldBox.z !== (zeroNode.z_index || 0)
		) {
			return true;
		}
	}

	return false; // No significant changes detected
}

// --- Constants ---
const ZOOM_PADDING_FACTOR = 0.5; // Zoom to 50% of viewport size

// Core state using $state rune as module-level variables
// REMOVE viewport state from here (now in viewportStore)
// let zoom = $state(1);
// let offsetX = $state(0);
// let offsetY = $state(0);
// let targetZoom = $state(1);
// let targetOffsetX = $state(0);
// let targetOffsetY = $state(0);

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

// Persistence state
let persistenceEnabled = $state(true);
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let hasSavedState = $state(false);

// Subscribe to Zero adapter for boxes data ONLY
let boxes = $state<AppBoxState[]>([]);
let zeroUnsubscribe: (() => void) | null = null;

// Function to handle Zero subscription
function setupZeroSubscription() {
	console.log('🔄 Canvas Store: setupZeroSubscription called');

	// Clean up any existing subscription
	if (zeroUnsubscribe) {
		zeroUnsubscribe();
		zeroUnsubscribe = null;
	}

	// Only subscribe if Zero is enabled
	if (typeof window !== 'undefined' && canvasZeroAdapter.isEnabled) {
		console.log('🔄 Canvas Store: Setting up Zero subscription (Zero is enabled)');
		zeroUnsubscribe = canvasZeroAdapter.allNodes.subscribe((zeroNodes) => {
			// Double-check that Zero is still enabled
			if (!canvasZeroAdapter.isEnabled) {
				console.log('🔄 Canvas Store: Zero was disabled during subscription, ignoring data');
				return;
			}

			if (Array.isArray(zeroNodes)) {
				// Filter out any null or undefined nodes from the raw Zero data
				const validZeroNodes = zeroNodes.filter(Boolean);

				// Defend against unnecessary reactive churn from polling.
				if (!haveBoxesChanged(boxes, validZeroNodes)) {
					return;
				}
				console.log('🔄 Zero sync: nodes changed, updating store.', validZeroNodes.slice(0, 3));
				// Convert Zero nodes to AppBoxState format
				boxes = validZeroNodes.map((node: any) => {
					let processedContent = node.content;

					// Ensure content is a string for PDF and Quill nodes
					if (node.type === 'pdf' || node.type === 'quill') {
						if (typeof processedContent !== 'string') {
							processedContent = JSON.stringify(processedContent);
						}
					}

					return {
						id: parseInt(node.id),
						x: node.x,
						y: node.y,
						width: node.width,
						height: node.height,
						z: node.z_index || 0,
						content: processedContent,
						color: node.color || '#ffffff',
						type: node.type || 'note',
						tags: node.tags || []
					};
				});
			}
		});
	} else {
		console.log('🔄 Canvas Store: Skipping Zero subscription (Zero is disabled or not in browser)');
	}
}

// Don't set up subscription immediately - wait to check if canvas manager is present
// setupZeroSubscription();

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
	padding: number = 60,
	preferredPosition?: { x: number; y: number }
): { x: number; y: number } {
	// Check overlaps across ALL Z-levels for visual clarity
	const allBoxes = existingBoxes;

	// If a preferred position is provided, try it first
	if (preferredPosition) {
		const testPosition = {
			x: preferredPosition.x,
			y: preferredPosition.y,
			width: targetBox.width,
			height: targetBox.height
		};

		const hasOverlap = allBoxes.some((existingBox) =>
			boxesOverlap(testPosition, existingBox, padding)
		);

		if (!hasOverlap) {
			return { x: Math.round(preferredPosition.x), y: Math.round(preferredPosition.y) };
		}

		// If preferred position overlaps, try positions around it in a spiral pattern
		const spiralPositions: { x: number; y: number }[] = [];
		const step = Math.max(targetBox.width, targetBox.height) + padding;

		for (let radius = 1; radius <= 10; radius++) {
			for (let angle = 0; angle < 360; angle += 45) {
				const radians = (angle * Math.PI) / 180;
				const x = preferredPosition.x + Math.cos(radians) * radius * step;
				const y = preferredPosition.y + Math.sin(radians) * radius * step;
				spiralPositions.push({ x, y });
			}
		}

		// Try spiral positions around the preferred location
		for (const position of spiralPositions) {
			const testPosition = {
				x: position.x,
				y: position.y,
				width: targetBox.width,
				height: targetBox.height
			};

			const hasOverlap = allBoxes.some((existingBox) =>
				boxesOverlap(testPosition, existingBox, padding)
			);

			if (!hasOverlap) {
				return { x: Math.round(position.x), y: Math.round(position.y) };
			}
		}
	}

	// Fallback to grid-based approach for backward compatibility
	const gridSize = 300; // Grid cell size
	const gridCols = 20; // 20 columns
	const gridRows = 15; // 15 rows
	const startX = preferredPosition?.x || -3000; // Start from preferred position or default
	const startY = preferredPosition?.y || -2250; // Start from preferred position or default

	// Create a list of grid positions and shuffle them for variety
	const gridPositions: { x: number; y: number }[] = [];
	for (let row = 0; row < gridRows; row++) {
		for (let col = 0; col < gridCols; col++) {
			const x = startX + (col - gridCols / 2) * gridSize + Math.random() * 100 - 50; // Center around preferred position
			const y = startY + (row - gridRows / 2) * gridSize + Math.random() * 100 - 50; // Center around preferred position
			gridPositions.push({ x, y });
		}
	}

	// Shuffle the grid positions for variety
	for (let i = gridPositions.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[gridPositions[i], gridPositions[j]] = [gridPositions[j], gridPositions[i]];
	}

	// Try grid positions
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
	// Loaded image dimensions

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
			z,
			tags: []
		} as AppBoxState);
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

let selectedBoxId = $state<number | null>(null);
let lastSelectedBoxId = $state<number | null>(null);
let draggingBoxId = $state<number | null>(null);
let ghostedBoxIds = $state<Set<number>>(new Set());
let boundaryHitBoxId = $state<number | null>(null); // Track which box hit the Z-boundary

// --- Update addBox, updateBox, deleteBox to use Zero only ---
async function addBoxInternal(box: AppBoxState) {
	if (box.content && Array.isArray(box.content)) {
		console.error('Refusing to store array as content in addBoxInternal!', box.content);
		return;
	}

	// Only use Zero if it's enabled
	if (canvasZeroAdapter.isEnabled) {
		try {
			// Add to Zero first
			await canvasZeroAdapter.addNode({
				x: box.x,
				y: box.y,
				width: box.width,
				height: box.height,
				type: box.type,
				content: box.content,
				// @ts-ignore extra fields tolerated by backend
				tags: box.tags,
				color: box.color
			} as any);
		} catch (error) {
			console.error('Failed to add box to Zero:', error);
		}
	}
}

async function updateBoxInternal(id: number, partial: Partial<AppBoxState>) {
	if (partial.content && Array.isArray(partial.content)) {
		console.error('Refusing to store array as content in updateBoxInternal!', partial.content);
		return;
	}

	// Only use Zero if it's enabled
	if (canvasZeroAdapter.isEnabled) {
		try {
			// Update in Zero first
			await canvasZeroAdapter.updateBox(id, partial);
		} catch (error) {
			console.error('Failed to update box in Zero:', error);
		}
	}
}

async function deleteBoxInternal(id: number) {
	// Only use Zero if it's enabled
	if (canvasZeroAdapter.isEnabled) {
		try {
			// Delete from Zero first
			await canvasZeroAdapter.deleteBox(id);
		} catch (error) {
			console.error('Failed to delete box from Zero:', error);
		}
	}
}

// --- Persistence Functions ---
function debouncedSave() {
	if (!persistenceEnabled) return;

	// Clear existing timeout
	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
	}

	// Set new timeout to save after 1 second of inactivity
	autoSaveTimeout = setTimeout(() => {
		saveState();
	}, 1000);
}

async function saveState() {
	if (!persistenceEnabled) return;

	// Only use Zero if it's enabled
	if (canvasZeroAdapter.isEnabled) {
		try {
			// Save viewport state to Zero
			await canvasZeroAdapter.updateViewport({
				zoom: get(zoom),
				offsetX: get(offsetX),
				offsetY: get(offsetY),
				selectedBoxId: selectedBoxId,
				fullscreenBoxId: fullscreenBoxId,
				lastSelectedBoxId: lastSelectedBoxId,
				persistenceEnabled: persistenceEnabled
			});
			console.log('💾 Canvas state saved to Zero');
		} catch (error) {
			console.error('Failed to save canvas state to Zero:', error);
		}
	}
}

async function loadState() {
	// Only use Zero if it's enabled
	if (canvasZeroAdapter.isEnabled) {
		try {
			// Initialize Zero adapter defaults
			await canvasZeroAdapter.initializeDefaults();
			console.log('📂 Canvas state loading from Zero...');
			// State will be loaded via Zero subscriptions set up earlier
		} catch (error) {
			console.error('Failed to load canvas state from Zero:', error);
		}
	}
}

// Load state on module initialization
// Skip if canvasManager will handle loading
if (typeof window !== 'undefined' && !localStorage.getItem('canvas-engine-canvases')) {
	console.log('🔄 Canvas Store: No canvas manager detected, setting up Zero subscription');
	setupZeroSubscription();
	loadState();
} else if (typeof window !== 'undefined') {
	console.log('🔄 Canvas Store: Canvas manager detected, skipping Zero subscription');
}

// Store functions
export const canvasStore = {
	// Getters for accessing state
	get zoom() {
		return get(zoom);
	},
	get offsetX() {
		return get(offsetX);
	},
	get offsetY() {
		return get(offsetY);
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
	get persistenceEnabled() {
		return persistenceEnabled;
	},
	get hasSavedState() {
		return hasSavedState;
	},

	// --- MUTATIONS ---

	panBy(dx: number, dy: number) {
		offsetX.set(get(offsetX) + dx);
		offsetY.set(get(offsetY) + dy);
		debouncedSave();
	},

	// Set the target viewport state (used by zooming action)
	setTargetViewport(target: { zoom: number; x: number; y: number }) {
		animationDuration = 0;
		debouncedSave();
	},

	// Set the target viewport state with smooth animation
	setTargetViewportAnimated(target: { zoom: number; x: number; y: number }, duration: number) {
		cancelZoomPanAnimation(); // Cancel any existing animation
		animationDuration = duration;
		smoothZoomPan(target.zoom, target.x, target.y, duration);
	},

	_setViewport(viewport: { zoom: number; x: number; y: number }) {
		zoom.set(viewport.zoom);
		offsetX.set(viewport.x);
		offsetY.set(viewport.y);
		debouncedSave();
	},

	setPersistence(enabled: boolean) {
		persistenceEnabled = enabled;
		// Note: canvasStore doesn't use localStorage directly, it uses Zero adapter
		// The canvas manager handles its own localStorage separately
	},

	// Clean up Zero subscription
	cleanupZeroSubscription() {
		if (zeroUnsubscribe) {
			zeroUnsubscribe();
			zeroUnsubscribe = null;
			console.log('Cleaned up Zero subscription');
		}
	},

	// Set up Zero subscription manually
	setupZeroSubscription() {
		setupZeroSubscription();
	},

	setAperture(enabled: boolean) {
		apertureEnabled = enabled;
	},

	async addBox(box: AppBoxState, avoidOverlaps: boolean = true) {
		if (avoidOverlaps) {
			const position = findNonOverlappingPosition(
				{ width: box.width, height: box.height, z: box.z },
				boxes,
				50, // max attempts
				50, // padding (increased for better spacing)
				{ x: box.x, y: box.y } // prefer the provided position
			);

			// Create the final box with the collision-free position
			const finalBox = { ...box, x: position.x, y: position.y };
			boxes.push(finalBox);
			await addBoxInternal(finalBox); // Save to database
		} else {
			boxes.push(box);
			await addBoxInternal(box); // Save to database
		}
	},

	async updateBox(id: number, partial: Partial<AppBoxState>) {
		const boxIndex = boxes.findIndex((box) => box.id === id);
		if (boxIndex !== -1) {
			const box = boxes[boxIndex];
			const updatedBox = { ...box, ...partial };

			if (updatedBox.width !== undefined) {
				updatedBox.width = Math.max(200, updatedBox.width);
			}
			if (updatedBox.height !== undefined) {
				updatedBox.height = Math.max(200, updatedBox.height);
			}
			boxes = boxes.map((b) => (b.id === id ? updatedBox : b));
			await updateBoxInternal(id, partial);
			debouncedSave();
		}
	},

	selectBox(id: number | null, viewportWidth?: number, viewportHeight?: number) {
		if (id !== null) {
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

	enterFullscreen(boxId: number, viewportWidth: number, viewportHeight: number) {
		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex === -1) return;

		// Store original view state only if not already fullscreen
		if (fullscreenBoxId === null) {
			originalViewZoom = get(zoom);
			originalViewOffsetX = get(offsetX);
			originalViewOffsetY = get(offsetY);
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
		transitionSourceZoom = get(zoom);
		transitionSourceOffsetX = get(offsetX);
		transitionSourceOffsetY = get(offsetY);
		animationDuration = FOCUS_TRANSITION_DURATION; // Use the constant
	},

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

	_finalizeExitFullscreen() {
		fullscreenBoxId = null;
		originalBoxState = null;
		isAnimatingFullscreen = false;
		fullscreenTransitionStartTime = null;
	},

	zoomToBox(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) {
			console.warn(`📦 Box ${boxId} not found for zoomToBox`);
			return;
		}

		// Cancel any existing animation first
		cancelZoomPanAnimation();

		const { x, y, width, height, z } = box;

		// Store previous zoom state before starting transition
		if (zoomedBoxId === null) {
			prevZoom = get(zoom);
			prevOffsetX = get(offsetX);
			prevOffsetY = get(offsetY);
		}
		zoomedBoxId = boxId;

		// 1. Calculate the center of the box in world coordinates
		const boxCenterX = x + width / 2;
		const boxCenterY = y + height / 2;

		// 2. Get the target zoom for the box's z-plane to be in focus
		// Use progressively higher zoom levels for deeper negative z-indices
		let newTargetZoom;
		// Use depth utility to derive appropriate focus zoom for all z-levels.
		newTargetZoom = getFocusZoomForZ(z);

		console.log(`🔍 Using z-index ${z}, target zoom: ${newTargetZoom}`);

		// NEW: Calculate dynamic padding based on z-index
		// Higher z-index (closer to camera) gets more padding
		// Base padding of 10% (0.9 fill factor), increases with z
		// z=0 → 10% padding (0.9), z=1 → 15% padding (0.85), z=2 → 20% padding (0.8), etc.
		const basePadding = 0.1; // 10% minimum padding
		const zPaddingFactor = Math.max(0, z) * 0.05; // 5% additional padding per z level
		const totalPaddingFactor = Math.min(0.3, basePadding + zPaddingFactor); // Cap at 30% padding
		const viewportFillFactor = 1 - totalPaddingFactor;

		console.log(
			`📏 Dynamic padding for z=${z}: ${(totalPaddingFactor * 100).toFixed(1)}%, fill factor: ${(viewportFillFactor * 100).toFixed(1)}%`
		);

		// Calculate scale factors based on box dimensions relative to viewport with dynamic padding
		const widthScaleFactor = (viewportWidth * viewportFillFactor) / width;
		const heightScaleFactor = (viewportHeight * viewportFillFactor) / height;

		// Use the minimum scale factor to ensure the box fits in both dimensions
		const sizeAdjustedZoom = Math.min(widthScaleFactor, heightScaleFactor);

		// OVERRIDE: For negative z (far-back nodes), don't reduce the zoom based on box size
		// This ensures the forced zoom level is maintained
		if (sizeAdjustedZoom < newTargetZoom && z >= 0) {
			console.log(
				`📏 Adjusting zoom for large box: original=${newTargetZoom.toFixed(2)}, size-adjusted=${sizeAdjustedZoom.toFixed(2)}`
			);
			newTargetZoom = sizeAdjustedZoom;
		}

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
			`\n  Current: zoom=${get(zoom).toFixed(2)} offset=(${get(offsetX).toFixed(1)}, ${get(offsetY).toFixed(1)})`,
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
				// Applying avoidance vector
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
		smoothZoomPan(newTargetZoom, newTargetOffsetX, newTargetOffsetY, FOCUS_TRANSITION_DURATION);

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

	restorePreviousZoom() {
		if (zoomedBoxId === null) return;

		// Cancel any existing animation first
		cancelZoomPanAnimation();

		// Clear the zoomed state first to prevent recursion
		zoomedBoxId = null;

		// Restore the previous zoom and viewport position
		smoothZoomPan(prevZoom, prevOffsetX, prevOffsetY, FOCUS_TRANSITION_DURATION);
	},

	setAnimatingDoublezoom(value: boolean) {
		isAnimatingDoublezoom = value;
	},

	clearAnimatingFullscreen() {
		isAnimatingFullscreen = false;
	},

	getState() {
		return {
			zoom: get(zoom),
			offsetX: get(offsetX),
			offsetY: get(offsetY),
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

			// Persist z-index change
			this.updateBox(boxId, { z: newZ });

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
				animationDuration = 250; // Smooth transition

				// Apply the smooth zoom and pan to center the box
				smoothZoomPan(newFocusZoom, newTargetOffsetX, newTargetOffsetY, animationDuration);

				// Update ghosting after a brief delay to let the zoom settle
				setTimeout(() => {
					this.checkAndGhostObstructors(boxId, viewportWidth, viewportHeight);
				}, 100);

				console.log(
					`📈 Moving Box ${boxId} forward: Z${oldZ} → Z${newZ}, zoom: ${get(zoom).toFixed(2)} → ${newFocusZoom.toFixed(2)}`
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

			// Persist z-index change
			this.updateBox(boxId, { z: newZ });

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
				animationDuration = 250; // Smooth transition

				// Apply the smooth zoom and pan to center the box
				smoothZoomPan(newFocusZoom, newTargetOffsetX, newTargetOffsetY, animationDuration);

				// Update ghosting after a brief delay to let the zoom settle
				setTimeout(() => {
					this.checkAndGhostObstructors(boxId, viewportWidth, viewportHeight);
				}, 100);

				console.log(
					`📉 Moving Box ${boxId} backward: Z${oldZ} → Z${newZ}, zoom: ${get(zoom).toFixed(2)} → ${newFocusZoom.toFixed(2)}`
				);
			}
		}
	},

	moveSelectedForward(viewportWidth?: number, viewportHeight?: number) {
		if (selectedBoxId !== null) {
			canvasStore.moveBoxForward(selectedBoxId, viewportWidth, viewportHeight);
		}
	},

	moveSelectedBackward(viewportWidth?: number, viewportHeight?: number) {
		if (selectedBoxId !== null) {
			canvasStore.moveBoxBackward(selectedBoxId, viewportWidth, viewportHeight);
		}
	},

	getBoxesByZIndex() {
		return [...boxes].sort((a, b) => a.z - b.z);
	},

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

	setDragging(boxId: number | null) {
		if (boxId !== null) {
			// Suspending parallax during drag
		} else {
			// Restoring parallax after drag completion
		}
		draggingBoxId = boxId;
	},

	clearDragging() {
		if (draggingBoxId !== null) {
			console.log(`🧹 Force clearing dragging state for Box ${draggingBoxId}`);
			draggingBoxId = null;
		}
	},

	centerBox(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) return;

		// Cancel any existing animation first
		cancelZoomPanAnimation();

		// Calculate the center of the box in world coordinates
		const boxCenterX = box.x + box.width / 2;
		const boxCenterY = box.y + box.height / 2;

		// Calculate offsets to center the box in the viewport at current zoom
		const currentZoom = get(zoom);
		const newTargetOffsetX = viewportWidth / 2 - boxCenterX * currentZoom;
		const newTargetOffsetY = viewportHeight / 2 - boxCenterY * currentZoom;

		// Set the animation target for smooth centering
		smoothZoomPan(currentZoom, newTargetOffsetX, newTargetOffsetY, 200);
	},

	checkAndGhostObstructors(boxId: number, viewportWidth: number, viewportHeight: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box) return;

		// Use the obstruction detection system
		const obstructionResult = detectObstruction(
			box,
			boxes,
			get(zoom),
			get(offsetX),
			get(offsetY),
			viewportWidth,
			viewportHeight
		);

		// --- NEW: compute next ghosted set but only update store if it changed ---
		const nextGhosted = new Set<number>();
		if (obstructionResult.isObstructed && obstructionResult.obstructingBoxes.length > 0) {
			obstructionResult.obstructingBoxes.forEach((obstructingBox) => {
				nextGhosted.add(obstructingBox.id);
			});
		}

		// Early-exit if the ghosted set is unchanged. This prevents redundant
		// store updates that can cascade into deep reactive loops (and ultimately
		// Svelte's `effect_update_depth_exceeded` safeguard).
		let changed = false;
		if (nextGhosted.size !== ghostedBoxIds.size) {
			changed = true;
		} else {
			for (const id of nextGhosted) {
				if (!ghostedBoxIds.has(id)) {
					changed = true;
					break;
				}
			}
		}

		if (changed) {
			// Replace the set to trigger reactivity exactly once
			ghostedBoxIds = nextGhosted;
			if (nextGhosted.size > 0) {
				console.log(
					`👻 Ghosting ${nextGhosted.size} obstructing boxes:`,
					[...nextGhosted].map((id) => `Box ${id}`).join(', ')
				);
			}
		}
	},

	refreshGhosting(viewportWidth: number, viewportHeight: number) {
		if (selectedBoxId !== null) {
			this.checkAndGhostObstructors(selectedBoxId, viewportWidth, viewportHeight);
		}
	},

	clearGhostedNodes() {
		if (ghostedBoxIds.size > 0) {
			// Clearing all ghosted nodes
			ghostedBoxIds = new Set(); // Trigger reactivity by replacement
		}
	},

	setZoom(newZoom: number, { autoUnfocus = false, maintainFocus = true } = {}) {
		const clampedZoom = Math.max(0.1, Math.min(10, newZoom)); // Clamp between 0.1x and 10x

		// Debug: Log when zooming occurs while a node is actively focused
		if (maintainFocus && zoomedBoxId !== null && selectedBoxId === zoomedBoxId) {
			console.log('zooming while focused');

			// Keep the focused box centered while zooming
			const focusedBox = boxes.find((b) => b.id === zoomedBoxId);
			if (focusedBox) {
				const oldZoom = get(zoom);
				const boxCenterX = focusedBox.x + focusedBox.width / 2;
				const boxCenterY = focusedBox.y + focusedBox.height / 2;

				// Current screen position of the box center
				const screenCenterX = boxCenterX * oldZoom + get(offsetX);
				const screenCenterY = boxCenterY * oldZoom + get(offsetY);

				// Compute new offsets so the box stays at the same screen position after zoom
				const newOffsetX = screenCenterX - boxCenterX * clampedZoom;
				const newOffsetY = screenCenterY - boxCenterY * clampedZoom;

				// Apply the new offsets immediately (no animation)
				offsetX.set(newOffsetX);
				offsetY.set(newOffsetY);
				animationDuration = 0;
			}
		}

		// Only auto-unfocus when explicitly requested (e.g., from keyboard shortcuts or UI buttons)
		// Don't auto-unfocus during continuous gestures like pinch zoom
		if (autoUnfocus && zoomedBoxId !== null) {
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
					zoom.set(clampedZoom);
					console.log(
						`🔍 Zoom set to ${clampedZoom.toFixed(2)}x with unfocus of Box ${previousZoomedBoxId}`
					);
					return;
				}
			}
		}

		zoom.set(clampedZoom);
	},

	unfocusNode() {
		if (zoomedBoxId === null) return;

		// Cancel any existing animation first
		cancelZoomPanAnimation();

		// Clear the zoomed state and restore previous zoom level
		const wasZoomedBoxId = zoomedBoxId;
		zoomedBoxId = null;

		// Restore the previous zoom and viewport position
		smoothZoomPan(prevZoom, prevOffsetX, prevOffsetY, FOCUS_TRANSITION_DURATION);

		console.log(
			`🔍 Unfocused Box ${wasZoomedBoxId}, restoring zoom: ${get(zoom).toFixed(2)} → ${prevZoom.toFixed(2)}`
		);
	},

	onViewChange(viewportWidth: number, viewportHeight: number) {
		if (selectedBoxId) {
			this.checkAndGhostObstructors(selectedBoxId, viewportWidth, viewportHeight);
		}
	},

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

	/**
	 * Remove a box from local state and persist the deletion.
	 */
	async deleteBox(id: number) {
		const idx = boxes.findIndex((b) => b.id === id);
		if (idx !== -1) {
			boxes.splice(idx, 1);
			await deleteBoxInternal(id);
			debouncedSave();
		}
	},

	/**
	 * Add a tag to the specified box if it does not already exist.
	 */
	async addTag(boxId: number, tag: string) {
		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex === -1) return;

		const box = boxes[boxIndex];
		// Initialize tags if undefined
		const currentTags: string[] = Array.isArray(box.tags) ? [...box.tags] : [];

		if (currentTags.includes(tag)) return; // Nothing to do

		const newTags = [...currentTags, tag];

		// Merge tags into the content object so ZeroDB doesn't wipe other fields.
		const mergedContent =
			typeof box.content === 'object' && box.content !== null
				? { ...box.content, tags: newTags }
				: { body: box.content, tags: newTags };

		boxes[boxIndex] = { ...box, tags: newTags, content: mergedContent };

		await updateBoxInternal(boxId, { content: mergedContent });
		debouncedSave();
	},

	/**
	 * Remove a tag from the specified box if present.
	 */
	async removeTag(boxId: number, tag: string) {
		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex === -1) return;

		const box = boxes[boxIndex];
		const currentTags: string[] = Array.isArray(box.tags) ? [...box.tags] : [];

		if (!currentTags.includes(tag)) return; // Nothing to remove

		const newTags = currentTags.filter((t) => t !== tag);

		const mergedContent =
			typeof box.content === 'object' && box.content !== null
				? { ...box.content, tags: newTags }
				: { body: box.content, tags: newTags };

		boxes[boxIndex] = { ...box, tags: newTags, content: mergedContent };

		await updateBoxInternal(boxId, { content: mergedContent });
		debouncedSave();
	}
};
