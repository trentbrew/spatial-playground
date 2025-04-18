<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { BoxState, GraphState, AppBoxState } from '$lib/canvasState'; // Import AppBoxState type
	import { serializeCanvasState, prepareStateForLoad } from '$lib/canvasState'; // Import functions
	import StickyNoteNode from '$lib/components/nodes/StickyNoteNode.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte'; // Import the toggle

	// --- Refs --- (Optional, but can be useful)
	let viewportElement: HTMLDivElement;
	let worldElement: HTMLDivElement;
	let bgCanvasElement: HTMLCanvasElement;
	let bgCtx: CanvasRenderingContext2D | null = null;

	// --- Constants ---
	const SMOOTHING_FACTOR = 0.2;
	const MIN_BOX_SIZE = 200; // Increased minimum size
	const ZOOM_PADDING_FACTOR = 0.9; // Zoom to 90% of viewport size
	const TRIPLEZOOM_DURATION = 400; // ms for fullscreen transition

	// --- Utility Functions ---
	function debounce<T extends (...args: any[]) => void>(
		func: T,
		wait: number
	): (...args: Parameters<T>) => void {
		let timeout: number | undefined;
		return (...args: Parameters<T>) => {
			clearTimeout(timeout);
			timeout = window.setTimeout(() => func(...args), wait);
		};
	}

	function lerp(start: number, end: number, factor: number): number {
		return start + (end - start) * factor;
	}

	// Easing function for smooth transitions
	function easeInOutQuad(t: number): number {
		return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
	}

	// --- State Serialization ---
	// Moved to src/lib/canvasState.ts

	// Wrapper function if needed for triggering serialization from UI
	function handleSerialize() {
		const currentState = serializeCanvasState(zoom, offsetX, offsetY, boxes);
		console.log('Serialized State:', JSON.stringify(currentState, null, 2));
		// TODO: Do something with the state (e.g., save to file/localStorage)
	}

	// Wrapper function for triggering load from UI
	function handleLoadState(state: GraphState) {
		if (!state) return;

		const updates = prepareStateForLoad(state);

		// Apply updates to component state
		targetZoom = updates.targetZoom;
		targetOffsetX = updates.targetOffsetX;
		targetOffsetY = updates.targetOffsetY;
		boxes = updates.newBoxes;

		// Clear potentially conflicting states
		zoomedBoxId = null;
		fullscreenBoxId = null;
		originalBoxState = null;
		triplezoomStartTime = 0; // Ensure no fullscreen animation is running

		// Start animation to transition to the new view
		startAnimation();
	}

	// --- Core State ---
	let zoom = 1;
	let offsetX = 0; // Current translation X
	let offsetY = 0; // Current translation Y
	let targetZoom = 1;
	let targetOffsetX = 0;
	let targetOffsetY = 0;
	let animationFrameId: number | null = null; // ID for cancelling animation frame

	// --- Interaction State ---
	let isPanning = false;
	let lastMouseX = 0;
	let lastMouseY = 0;
	let isSpacebarHeld = false;
	let isResizing = false;
	let resizingBoxId: number | null = null;
	let resizingHandleType: string | null = null;
	let startResizeMouseX = 0;
	let startResizeMouseY = 0;
	let startResizeX = 0;
	let startResizeY = 0;
	let startResizeWidth = 0;
	let startResizeHeight = 0;

	// Box Dragging State
	let isDraggingBox = false;
	let draggingBoxId: number | null = null;
	let dragStartMouseX = 0;
	let dragStartMouseY = 0;
	let dragStartBoxX = 0;
	let dragStartBoxY = 0;

	// Zoom-to-Box State
	let zoomedBoxId: number | null = null;
	let prevZoom = 1;
	let prevOffsetX = 0;
	let prevOffsetY = 0;

	// Fullscreen State (Triple Click / Button)
	let fullscreenBoxId: number | null = null;
	let originalBoxState: { id: number; x: number; y: number; width: number; height: number } | null =
		null;
	let originalViewZoom = 1; // Store the view state before entering fullscreen
	let originalViewOffsetX = 0;
	let originalViewOffsetY = 0;

	// State for dedicated triplezoom animation
	let triplezoomStartTime = 0;
	let transitionSourceZoom = 1; // View state at the start of the transition
	let transitionSourceX = 0;
	let transitionSourceY = 0;
	let isAnimatingFullscreen = false; // Flag for CSS transition
	let selectedBoxId: number | null = null; // Track the selected box ID
	let isAnimatingDoublezoom = false; // RE-ADD: Flag for slower double-click zoom animation

	// Click Tracking State
	let clickTimer: number | undefined = undefined;
	let clickCount = 0;
	let lastClickedBoxId: number | null = null;
	const CLICK_DELAY = 300; // ms threshold for multi-click

	// --- Touch State ---
	let isTouchPanning = false;
	let lastTouchX = 0;
	let lastTouchY = 0;
	let touchIdentifier: number | null = null;

	// --- Box Data ---
	// Reactive array of boxes on the canvas
	let boxes: AppBoxState[] = [
		{
			id: 1,
			x: 80,
			y: 40,
			width: 320,
			height: 200,
			content: 'Widget Area (Large Layout)',
			color: 'lightblue',
			type: 'sticky' // Default type
		},
		{
			id: 2,
			x: 450,
			y: 220,
			width: 220,
			height: 320,
			content: 'Sidebar / Panel',
			color: 'tomato',
			type: 'sticky' // Default type
		},
		{
			id: 3,
			x: -120,
			y: 400,
			width: 480,
			height: 200,
			content: 'Toolbar / Footer',
			color: 'lightgoldenrodyellow',
			type: 'sticky' // Default type
		}
	];

	// Map node types to their components
	const nodeComponentMap: Record<string, any> = {
		sticky: StickyNoteNode
		// button: ButtonNode, // Add others later
		// and: AndGateNode,
		// or: OrGateNode,
		// media: MediaNode,
	};

	// --- Computed Styles ---
	// Reactive CSS transform for the world element
	$: worldTransform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;

	// --- Coordinate Conversion (Relative to Viewport) ---
	function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
		// Convert screen coords (relative to viewport top-left) to world coords
		return {
			x: (screenX - offsetX) / zoom,
			y: (screenY - offsetY) / zoom
		};
	}

	// --- Drawing New Box State ---
	let isDrawingBox = false;
	let drawStartScreenX = 0;
	let drawStartScreenY = 0;
	let drawCurrentScreenX = 0;
	let drawCurrentScreenY = 0;
	let drawPreviewRect: { x: number; y: number; width: number; height: number } | null = null;

	// --- Box Interaction ---

	// Box Double Click (Zoom to Box) - REVISED
	function handleBoxDoubleClick(boxId: number, event: MouseEvent) {
		console.log(`[handleBoxDoubleClick] Fired for box ${boxId}`);
		if (!browser || !viewportElement) return;

		clearTimeout(clickTimer); // Prevent single click action
		clickCount = 0; // Reset counter
		lastClickedBoxId = null;
		event.stopPropagation(); // Prevent triggering viewport double-click

		// If already zoomed to this box, restore the view
		if (zoomedBoxId === boxId) {
			restorePreviousView();
		} else {
			// If zoomed to a *different* box, restore first, then zoom to new box
			if (zoomedBoxId !== null) {
				restorePreviousView();
				// Use timeout to allow restore animation to start before zoom animation
				setTimeout(() => zoomToBox(boxId), 50);
			} else {
				// Otherwise, just zoom in to the target box
				zoomToBox(boxId);
			}
		}
	}

	// Restore view from Zoom-to-Box - RE-ADD
	function restorePreviousView() {
		if (zoomedBoxId === null) return; // Not zoomed via double-click
		console.log('[restorePreviousView] Restoring view from double-click zoom');

		targetZoom = prevZoom;
		targetOffsetX = prevOffsetX;
		targetOffsetY = prevOffsetY;
		zoomedBoxId = null; // Clear the double-click zoomed state
		isAnimatingDoublezoom = true; // Use slower animation for restore
		startAnimation();
	}

	function handleBoxClick(boxId: number, event: MouseEvent) {
		if (!browser) return;
		// console.log(`Box clicked: ${boxId}`);
		console.log(`[handleBoxClick] Fired for box ${boxId}, preparing single-click timeout`, {
			clickCount: clickCount + 1
		});

		clearTimeout(clickTimer);

		if (lastClickedBoxId !== boxId) {
			// Reset count if clicking a different box
			clickCount = 0;
		}
		lastClickedBoxId = boxId;
		clickCount++;

		clickTimer = window.setTimeout(() => {
			if (clickCount === 1) {
				// --- Single Click Action --- (e.g., change color)
				// console.log(`Single click on box: ${boxId}`);
				// const boxIndex = boxes.findIndex((b) => b.id === boxId);
				// if (boxIndex !== -1) {
				// 	const currentBox = boxes[boxIndex];
				// 	const defaultColor = 'lightblue';
				// 	const clickedColor = 'lightcoral';
				// 	currentBox.color = currentBox.color === clickedColor ? defaultColor : clickedColor;
				// 	boxes = [...boxes];
				// }
				console.log(`[handleBoxClick] Single-click timeout resolved for box ${boxId}`);
			}
			// Reset click count after timeout
			clickCount = 0;
			lastClickedBoxId = null;
		}, CLICK_DELAY);

		// Double click action is now handled by its specific handler (handleBoxDoubleClick)
		// Triple click action is REMOVED
	}

	// --- Draw Background ---
	function drawBackground() {
		if (!browser || !bgCtx || !bgCanvasElement) return;

		const ctx = bgCtx;
		const width = bgCanvasElement.width;
		const height = bgCanvasElement.height;
		const dpr = window.devicePixelRatio || 1;
		const viewWidthLogical = width / dpr;
		const viewHeightLogical = height / dpr;

		// Reset transform and apply DPR scaling
		ctx.resetTransform();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, viewWidthLogical, viewHeightLogical);

		// Apply the world transformation (pan and zoom) to the canvas context
		// This makes the drawing operations below happen in world coordinates
		ctx.translate(offsetX, offsetY); // Translate the origin
		ctx.scale(zoom, zoom); // Scale around the new origin

		// --- Grid Drawing Logic (World Space) --- //
		const baseGridSize = 100; // World units for the largest grid
		const targetScreenSize = 50; // Ideal apparent size on screen (logical pixels)
		const baseDotRadius = 1; // Base radius in logical pixels at zoom = 1
		const maxGrids = 5;
		const fadeRange = 0.5;

		// Calculate viewport boundaries in world coordinates
		const worldViewTopLeft = screenToWorld(0, 0);
		const worldViewBottomRight = screenToWorld(viewWidthLogical, viewHeightLogical);

		// Iterate through grid levels
		for (let i = 0; i < maxGrids; i++) {
			const gridSizeWorld = baseGridSize / Math.pow(2, i); // Grid size in world units
			const gridSizeScreen = gridSizeWorld * zoom; // Apparent grid size in logical screen pixels

			// Skip grids that are too small or too large on screen
			if (gridSizeScreen < targetScreenSize / 4 || gridSizeScreen > targetScreenSize * 4) {
				continue;
			}

			// Calculate alpha based on closeness to target screen size
			let alpha = 0;
			if (gridSizeScreen > targetScreenSize) {
				alpha = 1.0 - Math.min(1, (gridSizeScreen / targetScreenSize - 1) / fadeRange);
			} else {
				alpha = Math.min(1, gridSizeScreen / (targetScreenSize * (1 - fadeRange)));
			}
			alpha = Math.max(0, alpha * alpha);
			if (alpha <= 0.01) continue;

			// Get base dot color from CSS variable
			const computedStyle = getComputedStyle(viewportElement);
			const baseDotColor = computedStyle.getPropertyValue('--grid-dot-color').trim();

			// Attempt to parse the base color and apply the calculated alpha
			let finalDotColor = `rgba(200, 200, 200, ${alpha})`; // Fallback
			try {
				// Assuming baseDotColor is like 'rgba(r, g, b, a)' or '#rgb' or '#rrggbb'
				// This parsing is basic; a robust library might be better for complex color formats
				let r = 200,
					g = 200,
					b = 200; // Default fallback values
				if (baseDotColor.startsWith('rgba')) {
					const parts = baseDotColor.match(/(\d+)/g);
					if (parts && parts.length >= 3) {
						r = parseInt(parts[0]);
						g = parseInt(parts[1]);
						b = parseInt(parts[2]);
						// Ignore original alpha, use calculated alpha
					}
				} else if (baseDotColor.startsWith('#')) {
					// Basic hex parsing (needs improvement for #rgb format)
					const hex = baseDotColor.substring(1);
					if (hex.length === 6) {
						r = parseInt(hex.substring(0, 2), 16);
						g = parseInt(hex.substring(2, 4), 16);
						b = parseInt(hex.substring(4, 6), 16);
					} else if (hex.length === 3) {
						// Handle #rgb shorthand
						r = parseInt(hex.substring(0, 1) + hex.substring(0, 1), 16);
						g = parseInt(hex.substring(1, 2) + hex.substring(1, 2), 16);
						b = parseInt(hex.substring(2, 3) + hex.substring(2, 3), 16);
					}
				}
				finalDotColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
			} catch (e) {
				console.warn('Could not parse CSS variable --grid-dot-color:', baseDotColor, e);
			}

			ctx.fillStyle = finalDotColor;

			// Calculate the dot radius in world units to appear constant size on screen
			const dotRadiusWorld = baseDotRadius / zoom;

			// Find the first grid lines within the world view
			const startWorldX = Math.floor(worldViewTopLeft.x / gridSizeWorld) * gridSizeWorld;
			const startWorldY = Math.floor(worldViewTopLeft.y / gridSizeWorld) * gridSizeWorld;
			const endWorldX = worldViewBottomRight.x; // Draw up to the right edge
			const endWorldY = worldViewBottomRight.y; // Draw up to the bottom edge

			// Draw dots at their world coordinates
			for (let worldX = startWorldX; worldX < endWorldX; worldX += gridSizeWorld) {
				for (let worldY = startWorldY; worldY < endWorldY; worldY += gridSizeWorld) {
					ctx.beginPath();
					// Draw arc at world coordinates, radius is also in world units
					ctx.arc(worldX, worldY, dotRadiusWorld, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
		// --- End Grid Drawing Logic --- //

		// Reset transform after drawing background elements
		ctx.resetTransform();
	}

	// --- Animation Loop ---
	function animateView(timestamp?: number) {
		// Add optional timestamp parameter
		if (!browser) return;
		const now = timestamp || performance.now(); // Use provided timestamp or get current time

		// Handle dedicated triplezoom (fullscreen) animation
		if (triplezoomStartTime > 0 && viewportElement) {
			const progress = Math.min(1, (now - triplezoomStartTime) / TRIPLEZOOM_DURATION);
			const easedProgress = easeInOutQuad(progress);

			// Interpolate viewport values from source to target
			offsetX = lerp(transitionSourceX, targetOffsetX, easedProgress);
			offsetY = lerp(transitionSourceY, targetOffsetY, easedProgress);
			zoom = lerp(transitionSourceZoom, targetZoom, easedProgress);

			// --- REMOVED Box Dimension/Position Interpolation from JS ---
			// CSS transition will handle the box size/position animation

			drawBackground(); // Redraw background during animation

			if (progress < 1) {
				// Continue the animation
				animationFrameId = requestAnimationFrame(animateView);
			} else {
				// Animation finished: Snap viewport to final values and clean up
				triplezoomStartTime = 0; // Stop the dedicated JS animation mode
				isAnimatingFullscreen = false; // Turn off CSS transition flag
				offsetX = targetOffsetX;
				offsetY = targetOffsetY;
				zoom = targetZoom;

				// --- REMOVED final box state snapping from JS ---
				// The box state should already be at its target due to immediate update

				// If exiting fullscreen, clear the state *after* animation completes
				if (targetZoom !== 1 && zoom === targetZoom) {
					// Check if we actually reached the non-fullscreen target zoom
					fullscreenBoxId = null;
					originalBoxState = null;
				}

				animationFrameId = null; // Stop requesting frames
				drawBackground(); // Final background draw with exact values
			}
		} else {
			// Regular animation logic (panning, zooming, double-click zoom)
			const oldOffsetX = offsetX;
			const oldOffsetY = offsetY;
			const oldZoom = zoom;

			// Determine smoothing factor based on context (RE-ADD check for double-click animation)
			const currentSmoothing = isAnimatingDoublezoom ? SMOOTHING_FACTOR / 2.5 : SMOOTHING_FACTOR;

			offsetX = lerp(offsetX, targetOffsetX, currentSmoothing);
			offsetY = lerp(offsetY, targetOffsetY, currentSmoothing);
			zoom = lerp(zoom, targetZoom, currentSmoothing);

			// Stop animation if very close to target
			const posThreshold = 0.1; // Allow slightly larger position threshold for snapping
			const zoomThreshold = 0.001; // Smaller threshold for zoom snapping

			if (
				Math.abs(offsetX - targetOffsetX) < posThreshold &&
				Math.abs(offsetY - targetOffsetY) < posThreshold &&
				Math.abs(zoom - targetZoom) < zoomThreshold
			) {
				// Snap to final target values
				offsetX = targetOffsetX;
				offsetY = targetOffsetY;
				zoom = targetZoom;
				animationFrameId = null; // Stop animation
				isAnimatingDoublezoom = false; // RE-ADD: Reset flag when animation completes/snaps
				drawBackground(); // Final draw
			} else {
				// Only redraw if values actually changed significantly to avoid unnecessary draws
				if (
					Math.abs(offsetX - oldOffsetX) > 0.01 ||
					Math.abs(offsetY - oldOffsetY) > 0.01 ||
					Math.abs(zoom - oldZoom) > 0.001
				) {
					drawBackground();
				}
				// Continue animation
				animationFrameId = requestAnimationFrame(animateView);
			}
		}

		// Note: Svelte's reactivity on offsetX, offsetY, zoom updates the worldTransform automatically
	}

	function startAnimation() {
		if (!animationFrameId) {
			// console.log("Animation started");
			animationFrameId = requestAnimationFrame(animateView);
		}
	}

	// --- Event Handlers ---

	// Keyboard
	function handleKeyDown(event: KeyboardEvent) {
		if (!browser || event.repeat) return;

		// Allow spacebar in inputs/textareas
		const target = event.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			if (event.key === ' ') {
				// Don't prevent default spacebar action for inputs
				return;
			}
		}

		if (event.key === ' ') {
			isSpacebarHeld = true;
			if (viewportElement && !isPanning) {
				viewportElement.style.cursor = 'grab';
			}
			event.preventDefault();
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (!browser) return;
		if (event.key === ' ') {
			isSpacebarHeld = false;
			if (viewportElement && !isPanning) {
				viewportElement.style.cursor = 'default';
			}
		}
	}

	// Mouse
	function handleMouseDown(event: MouseEvent) {
		if (!browser) return;
		console.log('[handleMouseDown] Event fired', {
			target: event.target,
			button: event.button,
			metaKey: event.metaKey
		});
		// --- Disable background interactions in fullscreen ---
		if (fullscreenBoxId !== null && event.target !== event.currentTarget) {
			// Allow clicks originating *within* the fullscreen box content to propagate
			// But block clicks starting on the viewport/world background itself.
			const targetElement = event.target as Element;
			if (targetElement === viewportElement || targetElement === worldElement) {
				return;
			}
		}

		const targetElement = event.target as Element;

		// --- Click Counting / Box Interaction Logic ---
		const boxElement = targetElement.closest('.box') as HTMLElement | null;
		if (boxElement) {
			const boxId = parseInt(boxElement.dataset.boxId ?? '', 10);
			if (!isNaN(boxId)) {
				console.log(`[handleMouseDown] Click inside box ${boxId}`);
				// Check handles/buttons first
				if (targetElement.closest('.fullscreen-toggle-button')) {
					console.log(
						`[handleMouseDown] Click on fullscreen button for box ${boxId} - skipping further box logic.`
					);
					return;
				}
				const dragHandleElement = targetElement.closest('.drag-handle');
				const resizeHandleElement = targetElement.closest('.resize-handle') as HTMLElement | null;

				if (dragHandleElement && !resizeHandleElement) {
					// Start Dragging
					const box = boxes.find((b) => b.id === boxId);
					if (box) {
						console.log(`[handleMouseDown] Starting drag for box ${boxId}`);
						selectedBoxId = boxId; // Select box on drag start
						isDraggingBox = true;
						draggingBoxId = box.id;
						dragStartMouseX = event.clientX;
						dragStartMouseY = event.clientY;
						dragStartBoxX = box.x;
						dragStartBoxY = box.y;
						event.preventDefault();
						event.stopPropagation();
						return;
					}
				} else if (resizeHandleElement && selectedBoxId === boxId) {
					// Start Resizing (only if selected)
					const handleType = resizeHandleElement.dataset.handleType;
					const box = boxes.find((b) => b.id === boxId);
					if (box && handleType) {
						console.log(
							`[handleMouseDown] Starting resize for box ${boxId} with handle ${handleType}`
						);
						isResizing = true;
						resizingBoxId = box.id;
						resizingHandleType = handleType;
						startResizeMouseX = event.clientX;
						startResizeMouseY = event.clientY;
						startResizeX = box.x;
						startResizeY = box.y;
						startResizeWidth = box.width;
						startResizeHeight = box.height;
						event.preventDefault();
						event.stopPropagation();
						return;
					}
				} else if (!dragHandleElement && !resizeHandleElement) {
					// Click on Box Content Area
					if (lastClickedBoxId !== boxId || clickCount === 0) {
						// First click in a potential sequence
						console.log(`[handleMouseDown] Starting click sequence for box ${boxId} (Click 1)`);
						selectedBoxId = boxId; // Select on first click
						clickCount = 1;
						lastClickedBoxId = boxId;
						clearTimeout(clickTimer);
						clickTimer = window.setTimeout(() => {
							handleBoxClick(boxId, event as MouseEvent); // Trigger single click action
							clickCount = 0; // Reset after timeout
							lastClickedBoxId = null;
						}, CLICK_DELAY);
					} else {
						// Subsequent click (2nd or 3rd)
						clickCount++;
						clearTimeout(clickTimer);
						console.log(
							`[handleMouseDown] Incremented click count for box ${boxId} to ${clickCount}`
						);
						if (clickCount === 2) {
							// Double click - on:dblclick handles the action
							// We just need to manage the timer/count here
							clickTimer = window.setTimeout(() => {
								console.log(
									`[handleMouseDown] Resetting click count after potential double-click timeout for box ${boxId}`
								);
								clickCount = 0;
								lastClickedBoxId = null;
							}, CLICK_DELAY);
						} else if (clickCount === 3) {
							// --- Triple click REMOVED --- //
							console.log(
								`[handleMouseDown] Triple click detected for box ${boxId} - ACTION REMOVED`
							);
							// handleBoxTripleClick(boxId, event);
							clickCount = 0; // Reset count immediately
							lastClickedBoxId = null;
						}
					}
					// Prevent panning when clicking on a box
					event.stopPropagation();
					return;
				}
			}
		} else if (
			targetElement === viewportElement ||
			targetElement === worldElement ||
			targetElement === bgCanvasElement
		) {
			// --- Click on Background ---
			if (!event.metaKey) {
				// Don't deselect if starting a Cmd+Drag create
				console.log('[handleMouseDown] Click on background/canvas - deselecting.');
				selectedBoxId = null;
			}

			// Fallback to Panning Logic (if applicable)
			if (event.button === 1 || (event.button === 0 && (event.altKey || isSpacebarHeld))) {
				console.log('[handleMouseDown] Starting pan.');
				isPanning = true;
				if (animationFrameId) cancelAnimationFrame(animationFrameId);
				animationFrameId = null;
				targetOffsetX = offsetX;
				targetOffsetY = offsetY;
				lastMouseX = event.clientX;
				lastMouseY = event.clientY;
				if (viewportElement) viewportElement.style.cursor = 'grabbing';
				event.preventDefault();
			}
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (!browser) return;

		// --- Update Box Drawing Preview ---
		if (isDrawingBox) {
			drawCurrentScreenX = event.clientX;
			drawCurrentScreenY = event.clientY;
			// Convert both points to world coordinates
			const start = screenToWorld(drawStartScreenX, drawStartScreenY);
			const current = screenToWorld(drawCurrentScreenX, drawCurrentScreenY);
			const x = Math.min(start.x, current.x);
			const y = Math.min(start.y, current.y);
			const width = Math.abs(current.x - start.x);
			const height = Math.abs(current.y - start.y);
			drawPreviewRect = { x, y, width, height };
			return;
		}

		if (isResizing && resizingBoxId !== null && resizingHandleType) {
			const deltaX = event.clientX - startResizeMouseX;
			const deltaY = event.clientY - startResizeMouseY;

			// Calculate change in world coordinates
			const worldDeltaX = deltaX / zoom;
			const worldDeltaY = deltaY / zoom;

			const boxIndex = boxes.findIndex((b) => b.id === resizingBoxId);
			if (boxIndex === -1) return; // Box not found, should not happen

			let newX = startResizeX;
			let newY = startResizeY;
			let newWidth = startResizeWidth;
			let newHeight = startResizeHeight;

			// Adjust dimensions and position based on handle type
			switch (resizingHandleType) {
				// Corners
				case 'se':
					newWidth = Math.max(MIN_BOX_SIZE, startResizeWidth + worldDeltaX);
					newHeight = Math.max(MIN_BOX_SIZE, startResizeHeight + worldDeltaY);
					break;
				case 'sw':
					newWidth = Math.max(MIN_BOX_SIZE, startResizeWidth - worldDeltaX);
					newHeight = Math.max(MIN_BOX_SIZE, startResizeHeight + worldDeltaY);
					newX = startResizeX + (startResizeWidth - newWidth); // Adjust x based on width change
					break;
				case 'ne':
					newWidth = Math.max(MIN_BOX_SIZE, startResizeWidth + worldDeltaX);
					newHeight = Math.max(MIN_BOX_SIZE, startResizeHeight - worldDeltaY);
					newY = startResizeY + (startResizeHeight - newHeight); // Adjust y based on height change
					break;
				case 'nw':
					newWidth = Math.max(MIN_BOX_SIZE, startResizeWidth - worldDeltaX);
					newHeight = Math.max(MIN_BOX_SIZE, startResizeHeight - worldDeltaY);
					newX = startResizeX + (startResizeWidth - newWidth);
					newY = startResizeY + (startResizeHeight - newHeight);
					break;
				// Sides
				case 'n':
					newHeight = Math.max(MIN_BOX_SIZE, startResizeHeight - worldDeltaY);
					newY = startResizeY + (startResizeHeight - newHeight);
					break;
				case 's':
					newHeight = Math.max(MIN_BOX_SIZE, startResizeHeight + worldDeltaY);
					break;
				case 'w':
					newWidth = Math.max(MIN_BOX_SIZE, startResizeWidth - worldDeltaX);
					newX = startResizeX + (startResizeWidth - newWidth);
					break;
				case 'e':
					newWidth = Math.max(MIN_BOX_SIZE, startResizeWidth + worldDeltaX);
					break;
			}

			// Update box properties in the array
			boxes[boxIndex] = {
				...boxes[boxIndex],
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight
			};

			// Trigger reactivity
			boxes = [...boxes];
		} else if (isDraggingBox && draggingBoxId !== null) {
			const deltaX = event.clientX - dragStartMouseX;
			const deltaY = event.clientY - dragStartMouseY;

			// Calculate change in world coordinates
			const worldDeltaX = deltaX / zoom;
			const worldDeltaY = deltaY / zoom;

			const boxIndex = boxes.findIndex((b) => b.id === draggingBoxId);
			if (boxIndex !== -1) {
				boxes[boxIndex].x = dragStartBoxX + worldDeltaX;
				boxes[boxIndex].y = dragStartBoxY + worldDeltaY;
				boxes = [...boxes]; // Trigger reactivity
			}
		} else if (isPanning) {
			const panDeltaX = event.clientX - lastMouseX;
			const panDeltaY = event.clientY - lastMouseY;

			// Update target offset directly during pan for immediate feedback
			// (Could add smoothing here too, but might feel laggy)
			targetOffsetX += panDeltaX;
			targetOffsetY += panDeltaY;
			// Also update current offset to avoid visual lag during drag
			offsetX = targetOffsetX;
			offsetY = targetOffsetY;

			lastMouseX = event.clientX;
			lastMouseY = event.clientY;
		}
	}

	function handleMouseUpOrLeave(event: MouseEvent | FocusEvent) {
		if (!browser) return;

		// --- Finish Drawing New Box ---
		if (isDrawingBox) {
			isDrawingBox = false;
			if (viewportElement) viewportElement.style.cursor = 'default';
			if (
				drawPreviewRect &&
				drawPreviewRect.width >= MIN_BOX_SIZE &&
				drawPreviewRect.height >= MIN_BOX_SIZE
			) {
				const newBox = {
					id: Date.now(),
					x: drawPreviewRect.x,
					y: drawPreviewRect.y,
					width: drawPreviewRect.width,
					height: drawPreviewRect.height,
					content: `New Box ${Date.now() % 1000}`,
					color: 'lightgreen',
					type: 'sticky'
				};
				boxes = [...boxes, newBox];
			}
			drawPreviewRect = null;
			return;
		}

		if (isResizing) {
			console.log(`Resizing stopped for box ${resizingBoxId}`);
			isResizing = false;
			resizingBoxId = null;
			resizingHandleType = null;
		}

		if (isDraggingBox) {
			console.log(`Dragging stopped for box ${draggingBoxId}`);
			isDraggingBox = false;
			draggingBoxId = null;
		}

		if (isPanning) {
			isPanning = false;
			if (viewportElement) {
				viewportElement.style.cursor = isSpacebarHeld ? 'grab' : 'default';
			}
		}
	}

	// Touch
	function handleTouchStart(event: TouchEvent) {
		if (!browser || event.touches.length !== 1) return;
		// Check target like in mousedown
		const targetElement = event.target as Element;
		if (targetElement !== viewportElement && targetElement !== worldElement) {
			return;
		}

		const touch = event.touches[0];
		isTouchPanning = true;
		// Cancel animation and sync state for touch pan
		if (animationFrameId) cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		targetOffsetX = offsetX;
		targetOffsetY = offsetY;
		touchIdentifier = touch.identifier;
		lastTouchX = touch.clientX;
		lastTouchY = touch.clientY;
		if (viewportElement) viewportElement.style.cursor = 'grabbing';
		event.preventDefault();
	}

	function handleTouchMove(event: TouchEvent) {
		if (!browser || !isTouchPanning || !touchIdentifier) return;
		let currentTouch: Touch | null = null;
		for (let i = 0; i < event.changedTouches.length; i++) {
			if (event.changedTouches[i].identifier === touchIdentifier) {
				currentTouch = event.changedTouches[i];
				break;
			}
		}
		if (!currentTouch) return;

		const deltaX = currentTouch.clientX - lastTouchX;
		const deltaY = currentTouch.clientY - lastTouchY;

		// Update target offset directly for touch pan
		targetOffsetX += deltaX;
		targetOffsetY += deltaY;
		// Update current offset too
		offsetX = targetOffsetX;
		offsetY = targetOffsetY;

		lastTouchX = currentTouch.clientX;
		lastTouchY = currentTouch.clientY;
		event.preventDefault();
	}

	function handleTouchEndOrCancel(event: TouchEvent) {
		if (!browser || !isTouchPanning || !touchIdentifier) return;
		let touchEnded = false;
		for (let i = 0; i < event.changedTouches.length; i++) {
			if (event.changedTouches[i].identifier === touchIdentifier) {
				touchEnded = true;
				break;
			}
		}
		if (touchEnded) {
			isTouchPanning = false;
			touchIdentifier = null;
			if (viewportElement) {
				viewportElement.style.cursor = 'default';
			}
		}
	}

	// Wheel Pan / Cmd+Scroll Zoom
	function handleWheel(event: WheelEvent) {
		if (!browser || !viewportElement) return;
		console.log(`[handleWheel] Fired. FullscreenActive: ${fullscreenBoxId !== null}`);

		// --- Disable background wheel events in fullscreen ---
		if (fullscreenBoxId !== null) {
			console.log('[handleWheel] Blocked due to fullscreen.');
			return;
		}

		event.preventDefault();

		const isZoomGesture = event.metaKey || event.ctrlKey;

		if (isZoomGesture && Math.abs(event.deltaY) > 0) {
			// --- Cmd/Ctrl + Scroll to Zoom ---
			const rect = viewportElement.getBoundingClientRect();
			const mouseX = event.clientX - rect.left;
			const mouseY = event.clientY - rect.top;
			const zoomFactor = 1.05;

			// Calculate world coordinates under the mouse *using current animated state*
			const worldBefore = screenToWorld(mouseX, mouseY);

			// Calculate new TARGET zoom
			let newTargetZoom = event.deltaY < 0 ? targetZoom * zoomFactor : targetZoom / zoomFactor;
			newTargetZoom = Math.max(0.1, Math.min(newTargetZoom, 10));

			// Calculate new TARGET offset to keep world point under mouse
			targetOffsetX = mouseX - worldBefore.x * newTargetZoom;
			targetOffsetY = mouseY - worldBefore.y * newTargetZoom;
			targetZoom = newTargetZoom;
		} else if (!isZoomGesture) {
			// --- Standard Scroll/Swipe to Pan ---
			// Update TARGET offset
			targetOffsetX -= event.deltaX;
			targetOffsetY -= event.deltaY;
		}

		// Start the animation loop if interaction occurred
		startAnimation();
	}

	// --- Add Box ---
	function addBox() {
		if (!browser || !viewportElement) return;

		// Calculate center of the viewport
		const rect = viewportElement.getBoundingClientRect();
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;

		// Convert center screen coordinates to world coordinates
		const worldCenter = screenToWorld(centerX, centerY);

		// Create a new box object
		const newBox = {
			id: Date.now(), // Simple unique ID using timestamp
			x: worldCenter.x - 50, // Center the box (adjusting for default 100 width)
			y: worldCenter.y - 25, // Center the box (adjusting for default 50 height)
			width: 100,
			height: 50,
			content: `New Box ${Date.now() % 1000}`,
			color: 'lightgreen', // Give new boxes a different color
			type: 'sticky'
		};

		// Add the new box to the array
		boxes = [...boxes, newBox];
		console.log('Added new box:', newBox);
	}

	// Double Click Reset / Restore
	function handleDoubleClick(event: MouseEvent) {
		if (!browser) return;

		if (fullscreenBoxId !== null) {
			// If a box is fullscreen, exit fullscreen
			exitFullscreen();
		} else if (zoomedBoxId !== null) {
			// If zoomed into a box via double-click, restore previous view
			// restorePreviousView();
		} else {
			// Otherwise, reset to default view
			targetZoom = 1;
			targetOffsetX = 0;
			targetOffsetY = 0;
			startAnimation();
		}
	}

	// --- Resize Logic ---
	const debouncedResizeHandler = debounce(() => {
		if (!browser || !viewportElement || !bgCanvasElement) return;

		// Use viewport rect for consistent dimensions
		const rect = viewportElement.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;

		// Resize background canvas
		bgCanvasElement.width = rect.width * dpr;
		bgCanvasElement.height = rect.height * dpr;
		bgCanvasElement.style.width = `${rect.width}px`;
		bgCanvasElement.style.height = `${rect.height}px`;

		// Scale background context if it exists
		// (We reset transform in drawBackground now)
		// if (bgCtx) { bgCtx.scale(dpr, dpr); }

		// Trigger redraw via animation loop if needed, or directly
		if (!animationFrameId) {
			// If not animating, draw background directly
			drawBackground();
		} else {
			// Animation loop will handle redraw
		}
	}, 50); // Debounce by 50ms

	// --- New Function: Set Box Dimensions Programmatically ---
	function setBoxDimensions(boxId: number, newWidth: number, newHeight: number) {
		if (!browser) return;

		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex === -1) {
			console.warn(`[setBoxDimensions] Box with ID ${boxId} not found.`);
			return;
		}

		// Validate inputs
		if (
			typeof newWidth !== 'number' ||
			typeof newHeight !== 'number' ||
			isNaN(newWidth) ||
			isNaN(newHeight)
		) {
			console.warn(`[setBoxDimensions] Invalid width or height provided.`);
			return;
		}

		const clampedWidth = Math.max(MIN_BOX_SIZE, newWidth);
		const clampedHeight = Math.max(MIN_BOX_SIZE, newHeight);

		// Update box properties
		boxes[boxIndex] = {
			...boxes[boxIndex],
			width: clampedWidth,
			height: clampedHeight
		};

		// Trigger reactivity
		boxes = [...boxes];

		console.log(`[setBoxDimensions] Resized box ${boxId} to ${clampedWidth}x${clampedHeight}`);
	}

	// --- Debug State ---
	// let debugBoxIdInput: string = ''; // REMOVED
	let debugWidthInput: string = '';
	let debugHeightInput: string = '';

	// REMOVED handleDebugResize function

	// --- Reactive Update FOR Debug Inputs (Populate on Select) ---
	// This block ONLY runs when selectedBoxId changes
	$: {
		console.log('[Debug Populate Triggered] selectedBoxId:', selectedBoxId);
		if (selectedBoxId !== null) {
			const selectedBox = boxes.find((box) => box.id === selectedBoxId);
			if (selectedBox) {
				// Unconditionally update inputs when selection changes
				debugWidthInput = selectedBox.width.toString();
				debugHeightInput = selectedBox.height.toString();
				console.log('[Debug Populate] Set inputs to:', debugWidthInput, debugHeightInput);
			} else {
				// Box selected but somehow not found? Clear.
				debugWidthInput = '';
				debugHeightInput = '';
			}
		} else {
			// No box selected, clear inputs
			debugWidthInput = '';
			debugHeightInput = '';
			console.log('[Debug Populate] Cleared inputs');
		}
	}

	// --- Reactive Update FROM Debug Inputs (Resize on Input Change) ---
	// This block ONLY runs when debugWidthInput or debugHeightInput change
	$: if (browser && selectedBoxId !== null && (debugWidthInput || debugHeightInput)) {
		console.log('[Debug Resize Triggered] Inputs:', debugWidthInput, debugHeightInput);
		const widthNum = parseInt(debugWidthInput, 10);
		const heightNum = parseInt(debugHeightInput, 10);

		// Find the currently selected box *at this moment*
		const selectedBox = boxes.find((box) => box.id === selectedBoxId);

		if (selectedBox) {
			let newWidth = selectedBox.width;
			let newHeight = selectedBox.height;
			let changed = false;

			// Check width input: must be valid number AND different from current box width
			if (!isNaN(widthNum) && widthNum !== selectedBox.width) {
				newWidth = widthNum; // Use the valid input number
				changed = true;
			}

			// Check height input: must be valid number AND different from current box height
			if (!isNaN(heightNum) && heightNum !== selectedBox.height) {
				newHeight = heightNum; // Use the valid input number
				changed = true;
			}

			// Only call setBoxDimensions if a valid change occurred
			if (changed) {
				console.log(
					'[Debug Resize] Calling setBoxDimensions with:',
					selectedBoxId,
					newWidth,
					newHeight
				);
				setBoxDimensions(selectedBoxId, newWidth, newHeight);
			}
		} else {
			console.warn('[Debug Resize Triggered] but selected box not found?');
		}
	}

	// --- Lifecycle ---
	let resizeObserver: ResizeObserver;

	onMount(() => {
		if (!browser || !viewportElement) return;

		// Get background canvas context
		bgCanvasElement = document.getElementById('background-canvas') as HTMLCanvasElement;
		if (bgCanvasElement) {
			bgCtx = bgCanvasElement.getContext('2d');
		}
		if (!bgCtx) {
			console.error('Failed to get background 2D context');
			// Potentially fall back to CSS background or show error
		}

		// Use ResizeObserver on the viewport element
		resizeObserver = new ResizeObserver(debouncedResizeHandler);
		resizeObserver.observe(viewportElement);

		// --- Add Listeners ---
		// Mouse listeners on viewport
		viewportElement.addEventListener('mousedown', handleMouseDown);
		viewportElement.addEventListener('wheel', handleWheel, { passive: false });
		// viewportElement.addEventListener('dblclick', handleDoubleClick); // REMOVED: Background double-click to reset

		// Touch listeners on viewport (Temporarily Disabled)
		// viewportElement.addEventListener('touchstart', handleTouchStart, { passive: false });

		// Global listeners for movement, key state, and release
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUpOrLeave);
		// window.addEventListener('touchmove', handleTouchMove, { passive: false }); // Temporarily Disabled
		// window.addEventListener('touchend', handleTouchEndOrCancel); // Temporarily Disabled
		// window.addEventListener('touchcancel', handleTouchEndOrCancel); // Temporarily Disabled
		window.addEventListener('blur', handleMouseUpOrLeave); // Handles panning stop if window loses focus

		// Trigger initial size calculation & background draw
		debouncedResizeHandler();

		// Start animation loop if needed (e.g., if initial state is not target)
		startAnimation();

		// Cleanup function
		return () => {
			if (!viewportElement) return; // Guard for safety
			viewportElement.removeEventListener('mousedown', handleMouseDown);
			viewportElement.removeEventListener('wheel', handleWheel);
			// viewportElement.removeEventListener('dblclick', handleDoubleClick); // REMOVED: Cleanup for background double-click
			// viewportElement.removeEventListener('touchstart', handleTouchStart); // Temporarily Disabled

			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUpOrLeave);
			// window.removeEventListener('touchmove', handleTouchMove); // Temporarily Disabled
			// window.removeEventListener('touchend', handleTouchEndOrCancel); // Temporarily Disabled
			// window.removeEventListener('touchcancel', handleTouchEndOrCancel); // Temporarily Disabled
			window.removeEventListener('blur', handleMouseUpOrLeave);
		};
	});

	// --- Fullscreen Logic ---

	function enterFullscreen(boxId: number) {
		if (!browser || !viewportElement) return;
		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex === -1) return;

		// Exit double-click zoom first if active (REVISED)
		if (zoomedBoxId !== null) {
			console.log('[enterFullscreen] Exiting double-click zoom before entering fullscreen.');
			restorePreviousView();
		}

		// Store original view state *only* if not already fullscreen
		// This preserves the view we want to return to when exiting the *first* fullscreen box
		if (fullscreenBoxId === null) {
			originalViewZoom = targetZoom; // Store the current target view
			originalViewOffsetX = targetOffsetX;
			originalViewOffsetY = targetOffsetY;
		}

		// Store the state of the box *before* it enters fullscreen
		// If switching fullscreen from another box, grab its original state if possible
		const boxToStore =
			fullscreenBoxId !== null && originalBoxState ? originalBoxState : boxes[boxIndex];
		originalBoxState = { ...boxToStore }; // Store original geometry

		fullscreenBoxId = boxId; // Set the *new* fullscreen box ID

		// --- Trigger CSS Transition & Update Box State Immediately ---
		isAnimatingFullscreen = true; // Enable CSS transition class
		const viewportWidth = viewportElement.clientWidth;
		const viewportHeight = viewportElement.clientHeight;

		// Get handle height from CSS variable
		const computedStyle = getComputedStyle(viewportElement);
		const handleHeightString = computedStyle
			.getPropertyValue('--handle-height')
			.trim()
			.replace('px', '');
		const handleHeight = parseFloat(handleHeightString) || 20; // Default to 20 if parsing fails

		// Update Box State Immediately: Box takes full viewport dimensions
		boxes[boxIndex] = {
			...boxes[boxIndex],
			x: 0,
			y: 0, // Box top remains at 0
			width: viewportWidth,
			height: viewportHeight // Box height takes full viewport
		};
		boxes = [...boxes];

		// --- Start JS Animation for Viewport ONLY ---
		// Store the view state *right before* starting the transition animation
		transitionSourceZoom = zoom;
		transitionSourceX = offsetX;
		transitionSourceY = offsetY;
		// Set target view state: Zoom to 1, pan so handle is just off-screen top
		targetZoom = 1;
		targetOffsetX = 0;
		targetOffsetY = 0; // Set offset Y to 0, box is already positioned at y=0

		// Start the dedicated triplezoom JS animation (for viewport)
		triplezoomStartTime = performance.now();
		if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel any ongoing regular animation
		animationFrameId = requestAnimationFrame(animateView);
	}

	function exitFullscreen() {
		if (fullscreenBoxId === null || !originalBoxState || !viewportElement) return;
		const boxIndex = boxes.findIndex((b) => b.id === fullscreenBoxId);
		if (boxIndex === -1) {
			console.warn("Exiting fullscreen but couldn't find box index");
			return;
		}

		// --- Trigger CSS Transition & Update Box State Immediately ---
		isAnimatingFullscreen = true; // Enable CSS transition class
		boxes[boxIndex] = {
			...boxes[boxIndex], // Keep existing properties
			x: originalBoxState.x,
			y: originalBoxState.y,
			width: originalBoxState.width,
			height: originalBoxState.height
		};
		boxes = [...boxes]; // Trigger reactivity

		// --- Start JS Animation for Viewport ONLY ---
		// Store the view state *right before* starting the transition animation
		transitionSourceZoom = zoom;
		transitionSourceX = offsetX;
		transitionSourceY = offsetY;
		// Set target view state back to the original view before *any* fullscreen started
		targetZoom = originalViewZoom;
		targetOffsetX = originalViewOffsetX;
		targetOffsetY = originalViewOffsetY;
		// Start the dedicated triplezoom JS animation (for viewport)
		triplezoomStartTime = performance.now();
		if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel any ongoing regular animation
		animationFrameId = requestAnimationFrame(animateView);

		// State clearing (fullscreenBoxId = null, originalBoxState = null)
		// now happens inside animateView when the transition completes.
	}

	// Helper function for the actual zoom logic - RE-ADD
	function zoomToBox(boxId: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box || !viewportElement) return;
		console.log(`[zoomToBox] Zooming to box ${boxId}`);

		// Store current view state as previous state for double-click restore
		prevZoom = targetZoom;
		prevOffsetX = targetOffsetX;
		prevOffsetY = targetOffsetY;
		zoomedBoxId = boxId;

		// Calculate target view
		const viewportWidth = viewportElement.clientWidth;
		const viewportHeight = viewportElement.clientHeight;

		const zoomX = (viewportWidth / box.width) * ZOOM_PADDING_FACTOR;
		const zoomY = (viewportHeight / box.height) * ZOOM_PADDING_FACTOR;
		const newTargetZoom = Math.min(zoomX, zoomY);

		const boxCenterX = box.x + box.width / 2;
		const boxCenterY = box.y + box.height / 2;

		targetOffsetX = viewportWidth / 2 - boxCenterX * newTargetZoom;
		targetOffsetY = viewportHeight / 2 - boxCenterY * newTargetZoom;
		targetZoom = newTargetZoom;

		isAnimatingDoublezoom = true; // Use slower animation for zoom-in
		startAnimation();
	}
</script>

<!-- Add Button / Back Button / Theme Toggle -->
<div class="controls-container">
	<button
		class="add-box-button"
		on:click={() => {
			if (fullscreenBoxId !== null) {
				exitFullscreen();
			} else {
				addBox();
			}
		}}
	>
		{#if fullscreenBoxId !== null}
			← Back
		{:else}
			+ Add Box
		{/if}
	</button>
	<ThemeToggle />

	<!-- Debug Controls -->
	<div class="debug-controls">
		<input
			type="number"
			placeholder="Width"
			bind:value={debugWidthInput}
			class="debug-input"
			disabled={selectedBoxId === null}
		/>
		<input
			type="number"
			placeholder="Height"
			bind:value={debugHeightInput}
			class="debug-input"
			disabled={selectedBoxId === null}
		/>
	</div>
</div>

<div class="viewport" bind:this={viewportElement}>
	<canvas id="background-canvas"></canvas>
	<!-- Background Canvas -->
	<div class="world" bind:this={worldElement} style:transform={worldTransform}>
		{#if drawPreviewRect}
			<div
				class="box box-preview"
				style="
					left: {drawPreviewRect.x}px;
					top: {drawPreviewRect.y}px;
					width: {drawPreviewRect.width}px;
					height: {drawPreviewRect.height}px;
					background-color: var(--preview-bg-color); /* Use CSS var */
					border: 2px dashed var(--preview-border-color); /* Use CSS var */
					pointer-events: none;
					z-index: 1000;
				"
			></div>
		{/if}
		{#each boxes as box (box.id)}
			{@const NodeComponent = nodeComponentMap[box.type] || StickyNoteNode}
			<!-- Fallback -->
			<div
				class="box"
				class:fullscreen-transition={isAnimatingFullscreen && box.id === fullscreenBoxId}
				class:selected={selectedBoxId === box.id}
				data-box-id={box.id}
				on:click={(event) => handleBoxClick(box.id, event as MouseEvent)}
				on:dblclick={(event) => handleBoxDoubleClick(box.id, event as MouseEvent)}
				style:left="{box.x}px"
				style:top="{box.y}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
				style:pointer-events={fullscreenBoxId !== null && box.id !== fullscreenBoxId
					? 'none'
					: 'auto'}
				style:z-index={fullscreenBoxId === box.id ? 10 : selectedBoxId === box.id ? 5 : 1}
				style:border-radius={fullscreenBoxId === box.id ? '8px 8px 0 0' : '10px'}
			>
				<!-- Drag Handle -->
				<div class="drag-handle" role="button" aria-label="Drag handle for Box {box.id}">
					<button
						class="fullscreen-toggle-button"
						on:click|stopPropagation={(event) => {
							event.preventDefault();
							if (fullscreenBoxId === box.id) {
								exitFullscreen();
							} else {
								enterFullscreen(box.id);
							}
						}}
					>
						{#if fullscreenBoxId === box.id}
							Exit
						{:else}
							Full
						{/if}
					</button>
				</div>

				<!-- Specific Node Content -->
				<svelte:component
					this={NodeComponent}
					id={box.id}
					bind:content={box.content}
					color={box.color}
					selected={selectedBoxId === box.id}
					fullscreen={fullscreenBoxId === box.id}
				/>

				<!-- Resize Handles -->
				{#if selectedBoxId === box.id && fullscreenBoxId !== box.id}
					<div class="resize-handle handle-nw" data-handle-type="nw"></div>
					<div class="resize-handle handle-n" data-handle-type="n"></div>
					<div class="resize-handle handle-ne" data-handle-type="ne"></div>
					<div class="resize-handle handle-w" data-handle-type="w"></div>
					<div class="resize-handle handle-e" data-handle-type="e"></div>
					<div class="resize-handle handle-sw" data-handle-type="sw"></div>
					<div class="resize-handle handle-s" data-handle-type="s"></div>
					<div class="resize-handle handle-se" data-handle-type="se"></div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.viewport {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		position: relative; /* Crucial for absolute positioning of world */
		background-color: var(--bg-color); /* Use CSS var */
		cursor: default; /* Default cursor for the area */
		touch-action: none; /* Disable browser touch actions like scroll/zoom */
	}

	#background-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 0; /* Behind the world */
		background-color: var(--bg-canvas-color); /* Use CSS var */
	}

	.world {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%; /* Take up space for event handling if needed */
		height: 100%;
		z-index: 1; /* Above the background canvas */
		transform-origin: 0 0;
		/* Remove background pattern from here */
		background-color: transparent; /* Allow background canvas to show */
		pointer-events: none; /* Allow clicks to pass through to viewport/boxes */
	}

	.world > * {
		pointer-events: auto; /* Re-enable pointer events for boxes */
	}

	.box {
		position: absolute;
		border: 1px solid var(--box-border-color); /* Use CSS var */
		border-radius: 10px;
		display: flex;
		padding: 4px;
		box-sizing: border-box;
		user-select: none;
		cursor: pointer;
		overflow: visible;
		flex-direction: column;
		/* Use CSS var - Note: overridden by StickyNote color prop */
		/* background-color: var(
			--box-bg-color-default
		);  */
		background-color: var(--handle-bg-color); /* Use CSS var */
	}

	.drag-handle {
		width: 100%;
		height: var(--handle-height); /* Use CSS var */
		background-color: var(--handle-bg-color); /* Use CSS var */
		border-radius: 8px 8px 0px 0px;
		cursor: move;
		flex-shrink: 0;
		/* border-bottom: 1px solid var(--handle-border-color);  */
		box-sizing: border-box;
		position: relative; /* Needed for absolute positioning of button */
	}

	.fullscreen-toggle-button {
		position: absolute;
		top: 1px;
		right: 1px;
		padding: 0px 3px;
		font-size: 10px;
		line-height: 1;
		height: calc(100% - 4px); /* Fit within handle height */
		background-color: var(--handle-button-bg); /* Use CSS var */
		color: var(--handle-text-color); /* Use CSS var */
		border: none;
		border-radius: 2px;
		cursor: pointer;
		z-index: 5; /* Above drag handle */
	}

	.fullscreen-toggle-button:hover {
		background-color: var(--handle-button-hover-bg); /* Use CSS var */
	}

	.box-content {
		flex-grow: 1;
		padding: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		width: 100%;
		height: 100%;
		text-align: center;
		white-space: normal;
		overflow-wrap: break-word;
	}

	.resize-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background-color: var(--resize-handle-bg); /* Use CSS var */
		border: 1px solid var(--resize-handle-border); /* Use CSS var */
		box-sizing: border-box;
		z-index: 10; /* Ensure handles are clickable */
	}

	/* Corner Handles */
	.handle-nw {
		top: -5px;
		left: -5px;
		cursor: nwse-resize;
	}
	.handle-ne {
		top: -5px;
		right: -5px;
		cursor: nesw-resize;
	}
	.handle-sw {
		bottom: -5px;
		left: -5px;
		cursor: nesw-resize;
	}
	.handle-se {
		bottom: -5px;
		right: -5px;
		cursor: nwse-resize;
	}

	/* Side Handles */
	.handle-n {
		top: -5px;
		left: 50%;
		transform: translateX(-50%);
		cursor: ns-resize;
	}
	.handle-s {
		bottom: -5px;
		left: 50%;
		transform: translateX(-50%);
		cursor: ns-resize;
	}
	.handle-w {
		top: 50%;
		left: -5px;
		transform: translateY(-50%);
		cursor: ew-resize;
	}
	.handle-e {
		top: 50%;
		right: -5px;
		transform: translateY(-50%);
		cursor: ew-resize;
	}

	/* Controls Container Style */
	.controls-container {
		position: fixed;
		bottom: 20px;
		left: 20px;
		z-index: 100;
		display: flex;
		gap: 10px; /* Add some space between buttons */
		align-items: center;
	}

	/* Add Box Button Style (keep specific styles if needed) */
	.add-box-button {
		padding: 8px 12px;
		background-color: var(--control-button-bg); /* Use CSS var */
		color: var(--control-button-text); /* Use CSS var */
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
	}

	.add-box-button:hover {
		background-color: var(--control-button-hover-bg); /* Use CSS var */
	}

	.box-preview {
		border-radius: 6px;
	}

	.box.fullscreen-transition {
		/* Match duration and easing with JS TRIPLEZOOM_DURATION */
		transition:
			width 400ms ease-in-out,
			height 400ms ease-in-out,
			left 400ms ease-in-out,
			top 400ms ease-in-out;
	}

	.box.selected {
		border-color: var(--box-selected-border-color); /* Use CSS var */
		box-shadow: 0 0 0 2px var(--box-bg-color-selected-shadow); /* Use CSS var */
	}

	/* Debug Controls Styling */
	.debug-controls {
		display: flex;
		align-items: center;
		gap: 5px;
		background-color: rgba(128, 128, 128, 0.1);
		padding: 5px;
		border-radius: 4px;
	}

	.debug-input {
		width: 80px; /* Adjust width as needed */
		padding: 4px 6px;
		border: 1px solid var(--box-border-color);
		background-color: var(--bg-color);
		color: var(--text-color);
		border-radius: 3px;
		font-size: 12px;
	}

	.debug-button {
		padding: 4px 8px;
		background-color: var(--control-button-bg);
		color: var(--control-button-text);
		border: none;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
	}

	.debug-button:hover {
		background-color: var(--control-button-hover-bg);
	}

	/* Style disabled debug controls */
	.debug-input:disabled,
	.debug-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.box-preview {
		border-radius: 6px;
	}
</style>
