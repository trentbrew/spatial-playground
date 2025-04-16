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

	// --- Touch State ---
	let isTouchPanning = false;
	let lastTouchX = 0;
	let lastTouchY = 0;
	let touchIdentifier: number | null = null;

	// --- Box Data ---
	// Reactive array of boxes on the canvas
	let boxes = [
		{ id: 1, x: 100, y: 50, width: 150, height: 80, content: 'Box 1', color: 'lightblue' },
		{ id: 2, x: 300, y: 200, width: 100, height: 100, content: 'Box 2 (Red)', color: 'tomato' },
		{ id: 3, x: -50, y: 300, width: 200, height: 60, content: 'Box 3', color: 'lightblue' }
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
	function handleBoxClick(boxId: number) {
		if (!browser) return;
		console.log(`Box clicked: ${boxId}`);

		const boxIndex = boxes.findIndex((b) => b.id === boxId);
		if (boxIndex !== -1) {
			const currentBox = boxes[boxIndex];
			const defaultColor = 'lightblue';
			const clickedColor = 'lightcoral';

			// Cycle color: lightblue -> lightcoral -> defaultColor (lightblue again)
			currentBox.color = currentBox.color === clickedColor ? defaultColor : clickedColor;

			// Trigger Svelte reactivity by reassigning the array
			boxes = [...boxes];
		}
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
	function lerp(start: number, end: number, factor: number): number {
		return start + (end - start) * factor;
	}

	function animateView() {
		if (!browser) return;

		// Interpolate current values towards target values
		offsetX = lerp(offsetX, targetOffsetX, SMOOTHING_FACTOR);
		offsetY = lerp(offsetY, targetOffsetY, SMOOTHING_FACTOR);
		zoom = lerp(zoom, targetZoom, SMOOTHING_FACTOR);

		// Draw the background with the new intermediate values
		drawBackground();

		// Stop animation if very close to target to prevent infinite loop
		const threshold = 0.01; // Small threshold for position and zoom
		if (
			Math.abs(offsetX - targetOffsetX) < threshold &&
			Math.abs(offsetY - targetOffsetY) < threshold &&
			Math.abs(zoom - targetZoom) < threshold * 0.1 // Smaller threshold for zoom
		) {
			// Snap to final target values
			offsetX = targetOffsetX;
			offsetY = targetOffsetY;
			zoom = targetZoom;
			animationFrameId = null;
			// Final background draw after snapping
			drawBackground();
		} else {
			// Continue animation
			animationFrameId = requestAnimationFrame(animateView);
		}

		// Note: Svelte's reactivity on offsetX, offsetY, zoom will update the worldTransform
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

		// Check if starting drag
		const dragHandleElement = targetElement.closest('.drag-handle');
		if (dragHandleElement) {
			const boxElement = dragHandleElement.closest('.box') as HTMLElement | null;
			if (!boxElement) return;

			const boxId = parseInt(boxElement.dataset.boxId ?? '', 10);
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
		}

		// Check if starting resize
		const handleElement = targetElement.closest('.resize-handle') as HTMLElement | null;
		if (handleElement) {
			const boxElement = targetElement.closest('.box') as HTMLElement | null;
			if (!boxElement) return;

			// Find the box data and handle type using data attributes
			const boxId = parseInt(boxElement.dataset.boxId ?? '', 10);
			const handleType = handleElement.dataset.handleType;
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
				event.preventDefault(); // Prevent text selection, etc.
				event.stopPropagation(); // Prevent triggering pan start on viewport
				return; // Don't proceed to panning checks
			}
		}

		// Check if clicking on box content (not drag or resize handle)
		if (targetElement.closest('.box')) {
			// Allow click for color change, but don't start pan
			return;
		}

		// Ensure click is directly on the viewport/world for panning
		if (targetElement !== viewportElement && targetElement !== worldElement) {
			return;
		}

		// Pan conditions: Middle Mouse OR (Left Mouse AND (Alt OR Space))
		if (event.button === 1 || (event.button === 0 && (event.altKey || isSpacebarHeld))) {
			isPanning = true;
			// Cancel any ongoing animation when starting a direct pan
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
			// Sync target with current state before starting drag
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

	// Double Click Reset
	function handleDoubleClick(event: MouseEvent) {
		if (!browser) return;
		// Set TARGET values for reset
		targetZoom = 1;
		targetOffsetX = 0;
		targetOffsetY = 0;
		// Start animation to smoothly reset view
		startAnimation();
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
				on:click={() => handleBoxClick(box.id)}
				style:left="{box.x}px"
				style:top="{box.y}px"
				style:width="{box.width}px"
				style:height="{box.height}px"
				style:background-color={box.color ?? 'lightblue'}
			>
				<!-- Drag Handle -->
				<div class="drag-handle"></div>
				<!-- Display dimensions -->
				<div class="box-content">
					{box.content}<br />
					({Math.round(box.width)} x {Math.round(box.height)})<br />
					Pos: ({Math.round(box.x)}, {Math.round(box.y)})
				</div>
				<!-- Resize Handles -->
				<div class="resize-handle handle-nw" data-handle-type="nw"></div>
				<div class="resize-handle handle-n" data-handle-type="n"></div>
				<div class="resize-handle handle-ne" data-handle-type="ne"></div>
				<div class="resize-handle handle-w" data-handle-type="w"></div>
				<div class="resize-handle handle-e" data-handle-type="e"></div>
				<div class="resize-handle handle-sw" data-handle-type="sw"></div>
				<div class="resize-handle handle-s" data-handle-type="s"></div>
				<div class="resize-handle handle-se" data-handle-type="se"></div>
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
