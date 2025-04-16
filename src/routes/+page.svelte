<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	// --- Refs --- (Optional, but can be useful)
	let viewportElement: HTMLDivElement;
	let worldElement: HTMLDivElement;
	let bgCanvasElement: HTMLCanvasElement;
	let bgCtx: CanvasRenderingContext2D | null = null;

	// --- Constants ---
	const SMOOTHING_FACTOR = 0.2;
	const MIN_BOX_SIZE = 20;
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
	let boxes = [
		{
			id: 1,
			x: 80,
			y: 40,
			width: 320,
			height: 180,
			content: 'Widget Area (Large Layout)',
			color: 'lightblue'
		},
		{
			id: 2,
			x: 450,
			y: 220,
			width: 220,
			height: 320,
			content: 'Sidebar / Panel',
			color: 'tomato'
		},
		{
			id: 3,
			x: -120,
			y: 400,
			width: 480,
			height: 120,
			content: 'Toolbar / Footer',
			color: 'lightgoldenrodyellow'
		}
	];

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

	// --- Box Interaction ---

	// Box Double Click (Zoom to Box)
	function handleBoxDoubleClick(boxId: number, event: MouseEvent) {
		if (!browser || !viewportElement) return;
		clearTimeout(clickTimer); // Prevent single click action
		clickCount = 0; // Reset counter
		lastClickedBoxId = null;
		event.stopPropagation(); // Prevent triggering viewport double-click

		// If fullscreen, exit fullscreen first, then zoom
		if (fullscreenBoxId === boxId || fullscreenBoxId !== null) {
			exitFullscreen();
			// Add a small delay to allow exit animation to start before zoom animation
			setTimeout(() => zoomToBox(boxId), 50);
			return;
		} else if (zoomedBoxId === boxId) {
			// Already zoomed to this box, so restore
			restorePreviousView();
		} else {
			// If zoomed to a different box, restore first
			if (zoomedBoxId !== null) {
				restorePreviousView();
				// Add delay before zooming to the new box
				setTimeout(() => zoomToBox(boxId), 50);
			} else {
				// Otherwise, just zoom in
				zoomToBox(boxId);
			}
		}
	}

	// Restore view from Zoom-to-Box
	function restorePreviousView() {
		if (zoomedBoxId === null) return; // Not zoomed via double-click

		targetZoom = prevZoom;
		targetOffsetX = prevOffsetX;
		targetOffsetY = prevOffsetY;
		zoomedBoxId = null; // Clear the double-click zoomed state
		startAnimation();
	}

	function handleBoxClick(boxId: number, event: MouseEvent) {
		if (!browser) return;
		// console.log(`Box clicked: ${boxId}`);

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
				console.log(`Single click on box: ${boxId}`);
				const boxIndex = boxes.findIndex((b) => b.id === boxId);
				if (boxIndex !== -1) {
					const currentBox = boxes[boxIndex];
					const defaultColor = 'lightblue';
					const clickedColor = 'lightcoral';
					currentBox.color = currentBox.color === clickedColor ? defaultColor : clickedColor;
					boxes = [...boxes];
				}
			}
			// Reset click count after timeout
			clickCount = 0;
			lastClickedBoxId = null;
		}, CLICK_DELAY);

		// Double and triple click actions are handled by their specific handlers
		// which are called *before* the single click timeout resolves.
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

			ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`; // #ccc with alpha

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

			// Interpolate box dimensions during transition
			if (fullscreenBoxId !== null && originalBoxState) {
				const boxIndex = boxes.findIndex((b) => b.id === fullscreenBoxId);
				if (boxIndex > -1) {
					const viewportWidth = viewportElement.clientWidth;
					const viewportHeight = viewportElement.clientHeight;

					// Determine start/end dimensions based on direction (entering/exiting fullscreen)
					const startWidth = targetZoom === 1 ? originalBoxState.width : viewportWidth; // Entering: start small, Exiting: start big
					const startHeight = targetZoom === 1 ? originalBoxState.height : viewportHeight;
					const endWidth = targetZoom === 1 ? viewportWidth : originalBoxState.width; // Entering: end big, Exiting: end small
					const endHeight = targetZoom === 1 ? viewportHeight : originalBoxState.height;

					// Temporarily update box geometry for animation frame
					// Use Object.assign for potentially better performance than spread in loop
					Object.assign(boxes[boxIndex], {
						width: lerp(startWidth, endWidth, easedProgress),
						height: lerp(startHeight, endHeight, easedProgress),
						// Animate position towards 0,0 when entering, and towards original when exiting
						x: lerp(
							targetZoom === 1 ? originalBoxState.x : 0,
							targetZoom === 1 ? 0 : originalBoxState.x,
							easedProgress
						),
						y: lerp(
							targetZoom === 1 ? originalBoxState.y : 0,
							targetZoom === 1 ? 0 : originalBoxState.y,
							easedProgress
						)
					});
					// No boxes = [...boxes] needed here, direct mutation is fine within animation loop
				}
			}

			drawBackground(); // Redraw background during animation

			if (progress < 1) {
				// Continue the animation
				animationFrameId = requestAnimationFrame(animateView);
			} else {
				// Animation finished: Snap to final values and clean up
				triplezoomStartTime = 0; // Stop the dedicated animation mode
				offsetX = targetOffsetX;
				offsetY = targetOffsetY;
				zoom = targetZoom;

				// Ensure final box state is correct after animation
				if (fullscreenBoxId !== null && originalBoxState) {
					const boxIndex = boxes.findIndex((b) => b.id === fullscreenBoxId);
					if (boxIndex > -1) {
						// Set final dimensions and position based on whether we entered or exited
						const finalWidth =
							targetZoom === 1 ? viewportElement.clientWidth : originalBoxState.width;
						const finalHeight =
							targetZoom === 1 ? viewportElement.clientHeight : originalBoxState.height;
						const finalX = targetZoom === 1 ? 0 : originalBoxState.x;
						const finalY = targetZoom === 1 ? 0 : originalBoxState.y;

						Object.assign(boxes[boxIndex], {
							x: finalX,
							y: finalY,
							width: finalWidth,
							height: finalHeight
						});
						boxes = [...boxes]; // Trigger Svelte reactivity *after* final update
					}
				}

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

			offsetX = lerp(offsetX, targetOffsetX, SMOOTHING_FACTOR);
			offsetY = lerp(offsetY, targetOffsetY, SMOOTHING_FACTOR);
			zoom = lerp(zoom, targetZoom, SMOOTHING_FACTOR);

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
		const targetElement = event.target as Element;

		// --- Click Counting Logic Integration ---
		const boxElement = targetElement.closest('.box') as HTMLElement | null;
		if (boxElement) {
			const boxId = parseInt(boxElement.dataset.boxId ?? '', 10);
			if (!isNaN(boxId)) {
				// Check if the click is on the fullscreen button first
				if (targetElement.closest('.fullscreen-toggle-button')) {
					// The button's own handler will manage fullscreen toggle
					return;
				}

				// Check if click is on drag/resize handles
				const dragHandleElement = targetElement.closest('.drag-handle');
				const resizeHandleElement = targetElement.closest('.resize-handle') as HTMLElement | null;

				if (dragHandleElement && !resizeHandleElement) {
					// --- Start Dragging --- (Existing Logic)
					const box = boxes.find((b) => b.id === boxId);
					if (box) {
						isDraggingBox = true;
						draggingBoxId = box.id;
						dragStartMouseX = event.clientX;
						dragStartMouseY = event.clientY;
						dragStartBoxX = box.x;
						dragStartBoxY = box.y;
						console.log(`Dragging started for box ${boxId}`);
						event.preventDefault();
						event.stopPropagation();
						return;
					}
				} else if (resizeHandleElement) {
					// --- Start Resizing --- (Existing Logic)
					const handleType = resizeHandleElement.dataset.handleType;
					const box = boxes.find((b) => b.id === boxId);
					if (box && handleType) {
						isResizing = true;
						resizingBoxId = box.id;
						resizingHandleType = handleType;
						startResizeMouseX = event.clientX;
						startResizeMouseY = event.clientY;
						startResizeX = box.x;
						startResizeY = box.y;
						startResizeWidth = box.width;
						startResizeHeight = box.height;
						console.log(`Resizing started for box ${boxId} with handle ${handleType}`);
						event.preventDefault();
						event.stopPropagation();
						return;
					}
				} else {
					// --- Handle Clicks (1, 2, 3) on Box Area (not handles) ---
					if (lastClickedBoxId !== boxId || clickCount === 0) {
						// If different box or count reset, start new sequence
						clickCount = 1;
						lastClickedBoxId = boxId;
						clearTimeout(clickTimer);
						clickTimer = window.setTimeout(() => {
							handleBoxClick(boxId, event as MouseEvent); // Trigger single click action
							clickCount = 0; // Reset after timeout
							lastClickedBoxId = null;
						}, CLICK_DELAY);
					} else {
						// Same box clicked again within delay
						clickCount++;
						clearTimeout(clickTimer);
						if (clickCount === 2) {
							handleBoxDoubleClick(boxId, event);
							// Don't reset count immediately, wait for potential triple
							clickTimer = window.setTimeout(() => {
								clickCount = 0;
								lastClickedBoxId = null;
							}, CLICK_DELAY);
						} else if (clickCount === 3) {
							handleBoxTripleClick(boxId, event);
							clickCount = 0; // Reset count immediately after triple
							lastClickedBoxId = null;
						}
					}
					// Prevent panning when clicking on a box (unless dragging starts)
					event.stopPropagation();
					return;
				}
			}
		}

		// --- Fallback to Panning Logic --- (Existing Logic)
		// Ensure click is directly on the viewport/world for panning
		if (targetElement !== viewportElement && targetElement !== worldElement) {
			return;
		}

		// Pan conditions: Middle Mouse OR (Left Mouse AND (Alt OR Space))
		if (event.button === 1 || (event.button === 0 && (event.altKey || isSpacebarHeld))) {
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

	function handleMouseMove(event: MouseEvent) {
		if (!browser) return;

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
			color: 'lightgreen' // Give new boxes a different color
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
			restorePreviousView();
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
		viewportElement.addEventListener('dblclick', handleDoubleClick);

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
			viewportElement.removeEventListener('dblclick', handleDoubleClick);
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

		// Exit double-click zoom first if active (it uses the regular animation)
		if (zoomedBoxId !== null) {
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

		// Store the view state *right before* starting the transition animation
		transitionSourceZoom = zoom;
		transitionSourceX = offsetX;
		transitionSourceY = offsetY;

		// Set target view state for fullscreen
		targetZoom = 1;
		targetOffsetX = 0;
		targetOffsetY = 0;

		// Start the dedicated triplezoom animation
		triplezoomStartTime = performance.now();
		if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel any ongoing regular animation
		animationFrameId = requestAnimationFrame(animateView);
	}

	function exitFullscreen() {
		if (fullscreenBoxId === null || !originalBoxState || !viewportElement) return;

		// Store the view state *right before* starting the transition animation
		transitionSourceZoom = zoom;
		transitionSourceX = offsetX;
		transitionSourceY = offsetY;

		// Set target view state back to the original view before *any* fullscreen started
		targetZoom = originalViewZoom;
		targetOffsetX = originalViewOffsetX;
		targetOffsetY = originalViewOffsetY;

		// Start the dedicated triplezoom animation
		triplezoomStartTime = performance.now();
		if (animationFrameId) cancelAnimationFrame(animationFrameId); // Cancel any ongoing regular animation
		animationFrameId = requestAnimationFrame(animateView);

		// State clearing (fullscreenBoxId = null, originalBoxState = null)
		// now happens inside animateView when the transition completes.
	}

	// Helper function for the actual zoom logic
	function zoomToBox(boxId: number) {
		const box = boxes.find((b) => b.id === boxId);
		if (!box || !viewportElement) return;

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

		startAnimation();
	}

	// Box Triple Click (Enter/Exit Fullscreen)
	function handleBoxTripleClick(boxId: number, event: MouseEvent) {
		if (!browser) return;
		clearTimeout(clickTimer); // Prevent single/double click action
		clickCount = 0; // Reset counter
		lastClickedBoxId = null;
		event.stopPropagation();

		console.log(`Triple click on box: ${boxId}`);
		if (fullscreenBoxId === boxId) {
			exitFullscreen();
		} else {
			enterFullscreen(boxId);
		}
	}
</script>

<!-- Add Button outside the viewport -->
<button class="add-box-button" on:click={addBox}>+ Add Box</button>

<div class="viewport" bind:this={viewportElement}>
	<canvas id="background-canvas"></canvas>
	<!-- Background Canvas -->
	<div class="world" bind:this={worldElement} style:transform={worldTransform}>
		{#each boxes as box (box.id)}
			<div
				class="box"
				data-box-id={box.id}
				on:click={(event) => handleBoxClick(box.id, event as MouseEvent)}
				on:dblclick={(event) => handleBoxDoubleClick(box.id, event)}
				style:left="{box.x}px"
				style:top="{box.y}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
				style:background-color={box.color ?? 'lightblue'}
				style:z-index={fullscreenBoxId === box.id ? 10 : 1}
				style:border-radius={fullscreenBoxId === box.id ? '0px' : '6px'}
			>
				<!-- Drag Handle (hide in fullscreen) -->
				<div class="drag-handle" style:display={fullscreenBoxId === box.id ? 'none' : 'flex'}>
					<!-- Fullscreen Toggle Button -->
					<button
						class="fullscreen-toggle-button"
						on:click|stopPropagation={(event) => {
							// Prevent drag start if clicking button
							event.preventDefault();
							// Toggle fullscreen state
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

				<!-- Display dimensions -->
				<div class="box-content">
					{box.content}<br />
					({Math.round(box.width)} x {Math.round(box.height)})<br />
					Pos: ({Math.round(box.x)}, {Math.round(box.y)})
				</div>

				<!-- Resize Handles (Hide in fullscreen) -->
				{#if fullscreenBoxId !== box.id}
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
		background-color: #f0f0f0; /* Background for the viewport */
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
		background-color: #f0f0f0; /* Canvas background color */
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
		border: 1px solid #333;
		/* border-radius: 6px; */ /* Controlled inline now */
		display: flex;
		padding: 0;
		box-sizing: border-box;
		user-select: none;
		cursor: pointer;
		overflow: visible;
		flex-direction: column;
		background-color: lightblue;
	}

	.drag-handle {
		width: 100%;
		height: 20px;
		background-color: gold;
		cursor: move;
		flex-shrink: 0;
		border-bottom: 1px solid #ccc;
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
		height: calc(100% - 2px); /* Fit within handle height */
		background-color: rgba(0, 0, 0, 0.2);
		color: white;
		border: none;
		border-radius: 2px;
		cursor: pointer;
		z-index: 5; /* Above drag handle */
	}

	.fullscreen-toggle-button:hover {
		background-color: rgba(0, 0, 0, 0.4);
	}

	.box-content {
		flex-grow: 1;
		padding: 5px;
		text-align: center;
		white-space: normal;
		overflow-wrap: break-word;
	}

	.resize-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background-color: rgba(0, 0, 255, 0.6); /* Blue handles */
		border: 1px solid white;
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

	/* Add Box Button Style */
	.add-box-button {
		position: fixed; /* Position relative to the browser window */
		top: 20px;
		left: 20px;
		z-index: 100; /* Ensure it's above the viewport */
		padding: 8px 12px;
		background-color: #444;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
	}

	.add-box-button:hover {
		background-color: #666;
	}
</style>
