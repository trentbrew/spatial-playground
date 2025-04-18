<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { writable, get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { canvasStore } from '$lib/stores/canvasStore';
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
	let zoom: number;
	let offsetX: number;
	let offsetY: number;
	let boxes: AppBoxState[];
	let selectedBoxId: number | null;
	let fullscreenBoxId: number | null;
	let zoomedBoxId: number | null;
	let isAnimatingDoublezoom: boolean;

	// Target state from store
	let targetZoom: number;
	let targetOffsetX: number;
	let targetOffsetY: number;

	// Create writable stores for viewport element and dimensions
	const viewportElementStore = writable<HTMLElement | null>(null);
	const viewportWidthStore = writable<number>(0);
	const viewportHeightStore = writable<number>(0);

	// Subscribe to store and extract state
	const unsubscribe = canvasStore.subscribe((state) => {
		zoom = state.zoom;
		offsetX = state.offsetX;
		offsetY = state.offsetY;
		targetZoom = state.targetZoom;
		targetOffsetX = state.targetOffsetX;
		targetOffsetY = state.targetOffsetY;
		isAnimatingDoublezoom = state.isAnimatingDoublezoom;
		zoomedBoxId = state.zoomedBoxId;
		boxes = state.boxes;
		selectedBoxId = state.selectedBoxId;
		fullscreenBoxId = state.fullscreenBoxId;
	});

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
			const storeState = get(canvasStore); // Get current store state for original values
			if (
				storeState.fullscreenBoxId !== null && // Check if we are technically still in fullscreen state
				targetZoom === storeState.originalViewZoom &&
				targetOffsetX === storeState.originalViewOffsetX &&
				targetOffsetY === storeState.originalViewOffsetY
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
	$: if (
		browser &&
		(zoom !== targetZoom || offsetX !== targetOffsetX || offsetY !== targetOffsetY)
	) {
		startAnimation();
	}

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
			const initialBoxes = get(canvasStore).boxes;
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

	onDestroy(unsubscribe);

	// --- Event Handlers ---
	function handleViewportClick(event: MouseEvent) {
		// Deselect box if the click didn't originate from a node box or the controls overlay
		const targetElement = event.target as Element;
		if (!targetElement.closest('.box') && !targetElement.closest('.controls-overlay')) {
			// Deselect the current box
			canvasStore.selectBox(null);

			// If we were zoomed in on a box (QuickFocus active), restore the previous view
			if (get(canvasStore).zoomedBoxId !== null) {
				canvasStore.restorePreviousView();
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

	const ZOOM_PADDING_FACTOR = 0.8; // Use 80% of viewport

	function calculateOptimalViewport(
		bbox: BoundingBox,
		viewportWidth: number,
		viewportHeight: number
	): { zoom: number; x: number; y: number } {
		// Calculate zoom level to fit the bounding box
		const zoomX = (viewportWidth / bbox.width) * ZOOM_PADDING_FACTOR;
		const zoomY = (viewportHeight / bbox.height) * ZOOM_PADDING_FACTOR;
		const newZoom = Math.min(zoomX, zoomY, 1); // Don't zoom in more than 1 initially

		// Calculate center of the bounding box in world coordinates
		const boxCenterX = bbox.minX + bbox.width / 2;
		const boxCenterY = bbox.minY + bbox.height / 2;

		// Calculate the offset needed to center the box center in the viewport
		const newOffsetX = viewportWidth / 2 - boxCenterX * newZoom;
		const newOffsetY = viewportHeight / 2 - boxCenterY * newZoom;

		return { zoom: newZoom, x: newOffsetX, y: newOffsetY };
	}
</script>

<div
	class="viewport"
	bind:this={viewportElement}
	use:panning
	use:zooming
	on:click={handleViewportClick}
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
