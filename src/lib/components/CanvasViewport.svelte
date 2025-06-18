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
	import TracingIndicator from './TracingIndicator.svelte';
	import ObstructionIndicator from './ObstructionIndicator.svelte';
	import SceneStats from './SceneStats.svelte';

	// --- Constants ---
	const SMOOTHING_FACTOR = 0.4;

	// --- Utility Functions ---
	function lerp(start: number, end: number, factor: number): number {
		return start + (end - start) * factor;
	}

	function easeOutQuart(t: number): number {
		return 1 - Math.pow(1 - t, 4);
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
	const animationDuration = $derived(canvasStore.animationDuration);

	// Create writable stores for viewport element and dimensions
	const viewportElementStore = writable<HTMLElement | null>(null);
	const viewportWidthStore = writable<number>(0);
	const viewportHeightStore = writable<number>(0);

	let animationFrameId: number | null = null;
	let animationStartTime: number | null = null;

	// Store the state at the beginning of an animation
	let animationSourceZoom = 1;
	let animationSourceOffsetX = 0;
	let animationSourceOffsetY = 0;

	function animateView(time: number) {
		if (!browser) return;
		if (animationStartTime === null) {
			animationStartTime = time;
		}

		const elapsedTime = time - animationStartTime;
		const duration = animationDuration > 0 ? animationDuration : 1; // Avoid division by zero
		const progress = Math.min(elapsedTime / duration, 1);

		// Use gentle easing for smooth zoom, but linear for focus animations
		const easedProgress = animationDuration <= 200 ? easeOutQuart(progress) : progress;

		const newZoom = lerp(animationSourceZoom, targetZoom, easedProgress);
		const newOffsetX = lerp(animationSourceOffsetX, targetOffsetX, easedProgress);
		const newOffsetY = lerp(animationSourceOffsetY, targetOffsetY, easedProgress);

		// Update the actual viewport state in the store
		canvasStore._setViewport({ zoom: newZoom, x: newOffsetX, y: newOffsetY });

		// Check for convergence (progress >= 1)
		if (progress >= 1) {
			// Snap to final target values and stop animation
			canvasStore._setViewport({ zoom: targetZoom, x: targetOffsetX, y: targetOffsetY });

			// If exiting fullscreen, finalize the state *after* animation completes
			if (
				canvasStore.fullscreenBoxId !== null &&
				targetZoom === canvasStore.originalViewZoom &&
				targetOffsetX === canvasStore.originalViewOffsetX &&
				targetOffsetY === canvasStore.originalViewOffsetY
			) {
				canvasStore._finalizeExitFullscreen();
			}

			// Reset animation flags
			if (isAnimatingDoublezoom) {
				canvasStore.setAnimatingDoublezoom(false);
			}
			if (canvasStore.isAnimatingFullscreen) {
				canvasStore.clearAnimatingFullscreen();
			}

			animationFrameId = null;
			animationStartTime = null;
		} else {
			// Continue animation
			animationFrameId = requestAnimationFrame(animateView);
		}
	}

	function startAnimation() {
		if (!browser) return;
		// If an animation frame is already requested, cancel it to restart.
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		// Store the starting point for the animation
		animationSourceZoom = zoom;
		animationSourceOffsetX = offsetX;
		animationSourceOffsetY = offsetY;
		animationStartTime = null; // Reset start time

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

		// Global keyboard handler to prevent browser shortcuts
		const globalKeyHandler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && (event.key === '[' || event.key === ']')) {
				event.preventDefault();
				event.stopPropagation();
				handleKeyDown(event);
			}
		};

		document.addEventListener('keydown', globalKeyHandler);

		const cleanup = () => {
			document.removeEventListener('keydown', globalKeyHandler);
		};

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
			cleanup(); // Remove global keyboard listener
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
		if (event.metaKey || event.ctrlKey) {
			if (event.key === ']' || event.key === '[') {
				// Always prevent default browser behavior for these shortcuts
				event.preventDefault();
				event.stopPropagation();

				// Only execute if we have a selected box
				if (selectedBoxId !== null) {
					// Get current viewport dimensions for zoom following
					const viewportWidth = viewportElement?.clientWidth || 0;
					const viewportHeight = viewportElement?.clientHeight || 0;

					if (event.key === ']') {
						canvasStore.moveSelectedForward(viewportWidth, viewportHeight);
						console.log(`Moved box ${selectedBoxId} forward in Z-axis with zoom following`);
					} else if (event.key === '[') {
						canvasStore.moveSelectedBackward(viewportWidth, viewportHeight);
						console.log(`Moved box ${selectedBoxId} backward in Z-axis with zoom following`);
					}
				}
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
		const bboxWidth = bbox.width + padding * 2;
		const bboxHeight = bbox.height + padding * 2;

		const zoomX = viewportWidth / bboxWidth;
		const zoomY = viewportHeight / bboxHeight;
		const newZoom = Math.min(zoomX, zoomY, 1); // Cap initial zoom at 1

		const newOffsetX = (viewportWidth - bbox.width * newZoom) / 2 - bbox.minX * newZoom;
		const newOffsetY = (viewportHeight - bbox.height * newZoom) / 2 - bbox.minY * newZoom;

		return { zoom: newZoom, x: newOffsetX, y: newOffsetY };
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={viewportElement}
	class="viewport"
	role="application"
	use:panning
	use:zooming
	onclick={handleViewportClick}
	onkeydown={handleKeyDown}
	tabindex="0"
>
	<BackgroundCanvas />
	<NodesLayer />
</div>

<ControlsOverlay />
<TracingIndicator />
<ObstructionIndicator />
<SceneStats />

<style>
	.viewport {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background-color: var(--canvas-bg);
		cursor: grab;
		outline: none; /* Remove focus outline */
	}

	.viewport:active {
		cursor: grabbing;
	}
</style>
