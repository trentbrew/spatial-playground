<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { browser } from '$app/environment';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import BackgroundCanvas from '$lib/components/BackgroundCanvas.svelte';
	import NodesLayer from '$lib/components/NodesLayer.svelte';
	import { panning } from '$lib/interactions/panning';
	import { zooming } from '$lib/interactions/zooming';
	import { setViewportContext } from '$lib/contexts/viewportContext';
	import ControlsOverlay from './ControlsOverlay.svelte';

	// --- Constants ---
	const SMOOTHING_FACTOR = 0.4;

	// --- Utility Functions ---
	function lerp(start: number, end: number, factor: number): number {
		return start + (end - start) * factor;
	}

	let viewportElement: HTMLDivElement;

	// Direct access to store properties (reactive)
	const zoom = $derived(canvasStore.zoom);
	const offsetX = $derived(canvasStore.offsetX);
	const offsetY = $derived(canvasStore.offsetY);
	const boxes = $derived(canvasStore.boxes);
	const selectedBoxId = $derived(canvasStore.selectedBoxId);
	const fullscreenBoxId = $derived(canvasStore.fullscreenBoxId);
	const zoomedBoxId = $derived(canvasStore.zoomedBoxId);
	const isAnimatingDoublezoom = $derived(canvasStore.isAnimatingDoublezoom);

	// Target state from store
	const targetZoom = $derived(canvasStore.targetZoom);
	const targetOffsetX = $derived(canvasStore.targetOffsetX);
	const targetOffsetY = $derived(canvasStore.targetOffsetY);

	// Create writable stores for viewport element and dimensions
	const viewportElementStore = writable<HTMLElement | null>(null);
	const viewportWidthStore = writable<number>(0);
	const viewportHeightStore = writable<number>(0);

	let animationFrameId: number | null = null;

	function animateView() {
		if (!browser) return;

		// Capture state *before* this animation step for checks upon convergence
		const wasFullscreen = fullscreenBoxId !== null;
		const wasAnimatingFullscreen = isAnimatingDoublezoom;
		const originalTargetZoom = targetZoom; // Store the target we were aiming for

		const currentSmoothing = isAnimatingDoublezoom ? SMOOTHING_FACTOR / 2.5 : SMOOTHING_FACTOR;

		const newZoom = lerp(zoom, targetZoom, currentSmoothing);
		const newOffsetX = lerp(offsetX, targetOffsetX, currentSmoothing);
		const newOffsetY = lerp(offsetY, targetOffsetY, currentSmoothing);

		// Update the actual viewport state in the store
		canvasStore._setViewport({ zoom: newZoom, x: newOffsetX, y: newOffsetY });

		// Check for convergence
		const posThreshold = 0.1;
		const zoomThreshold = 0.001;
		if (
			Math.abs(newOffsetX - targetOffsetX) < posThreshold &&
			Math.abs(newOffsetY - targetOffsetY) < posThreshold &&
			Math.abs(newZoom - targetZoom) < zoomThreshold
		) {
			// Snap to final target values and stop animation
			canvasStore._setViewport({ zoom: targetZoom, x: targetOffsetX, y: targetOffsetY });

			// If exiting fullscreen, finalize the state *after* animation completes
			// Check if we *were* fullscreen and the target matches the original view state
			if (
				canvasStore.fullscreenBoxId !== null && // Check if we are technically still in fullscreen state
				targetZoom === canvasStore.originalViewZoom &&
				targetOffsetX === canvasStore.originalViewOffsetX &&
				targetOffsetY === canvasStore.originalViewOffsetY
			) {
				canvasStore._finalizeExitFullscreen(); // Clear flags
			}

			// Reset double-zoom animation flag if it was active and animation finished
			if (isAnimatingDoublezoom) {
				canvasStore.setAnimatingDoublezoom(false);
			}

			// Clear fullscreen animation flag if it was active
			if (wasAnimatingFullscreen) {
				canvasStore.clearAnimatingFullscreen();
			}

			animationFrameId = null;
		} else {
			// Continue animation
			animationFrameId = requestAnimationFrame(animateView);
		}
	}

	function startAnimation() {
		if (!browser) return;
		// If an animation frame is already requested, canceling it and requesting a new one
		// ensures the loop continues if the target changed mid-animation or immediately after convergence.
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
		animationFrameId = requestAnimationFrame(animateView);
	}

	// Reactively start animation when target differs from current
	$effect(() => {
		if (
			browser &&
			(zoom !== targetZoom || offsetX !== targetOffsetX || offsetY !== targetOffsetY)
		) {
			startAnimation();
		}
	});

	// Provide context
	setViewportContext({
		elementStore: viewportElementStore,
		width: viewportWidthStore,
		height: viewportHeightStore
	});

	onMount(() => {
		// Update element store when element is bound
		viewportElementStore.set(viewportElement);

		// Observe viewport dimensions
		const resizeObserver = new ResizeObserver((entries) => {
			if (entries[0]) {
				const { width, height } = entries[0].contentRect;
				viewportWidthStore.set(width);
				viewportHeightStore.set(height);
			}
		});
		if (viewportElement) {
			resizeObserver.observe(viewportElement);
		}

		// Start animation on mount if needed
		startAnimation();

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
			resizeObserver.disconnect();
			// Ensure animation frame is cancelled on destroy
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId);
			}
		};
	});

	// --- Event Handlers ---
	function handleViewportClick(event: MouseEvent) {
		// Deselect box if the click didn't originate from a node box or the controls overlay
		const targetElement = event.target as Element;
		if (!targetElement.closest('.box') && !targetElement.closest('.controls-overlay')) {
			// Deselect the current box, no dimensions needed for deselect
			canvasStore.selectBox(null);
		}
	}

	// Keyboard event handler for Z-axis management
	function handleKeyDown(event: KeyboardEvent) {
		// Check for Cmd+] (move forward in Z) or Cmd+[ (move backward in Z)
		if ((event.metaKey || event.ctrlKey) && selectedBoxId !== null) {
			if (event.key === ']') {
				event.preventDefault();
				canvasStore.moveSelectedForward();
				console.log(`Moved box ${selectedBoxId} forward in Z-axis`);
			} else if (event.key === '[') {
				event.preventDefault();
				canvasStore.moveSelectedBackward();
				console.log(`Moved box ${selectedBoxId} backward in Z-axis`);
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
		const availableWidth = viewportWidth - padding * 2;
		const availableHeight = viewportHeight - padding * 2;

		// Calculate zoom to fit all boxes
		const zoomX = availableWidth / bbox.width;
		const zoomY = availableHeight / bbox.height;
		const zoom = Math.min(zoomX, zoomY, 1); // Don't zoom in beyond 1x initially

		// Calculate offset to center the boxes
		const centerX = bbox.minX + bbox.width / 2;
		const centerY = bbox.minY + bbox.height / 2;

		const x = viewportWidth / 2 - centerX * zoom;
		const y = viewportHeight / 2 - centerY * zoom;

		return { zoom, x, y };
	}
</script>

<div
	class="viewport"
	bind:this={viewportElement}
	use:panning
	use:zooming
	on:click={handleViewportClick}
	on:keydown={handleKeyDown}
	tabindex="0"
>
	<BackgroundCanvas />
	<NodesLayer />
	<ControlsOverlay />
	<!-- TODO: Add InteractionManager -->
</div>

<style>
	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: var(--bg-color);
		cursor: default;
		touch-action: none; /* Prevent default touch actions like pinch-zoom */
		overscroll-behavior: contain; /* Prevent browser back/forward navigation gestures */
	}
</style>
