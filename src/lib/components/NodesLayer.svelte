<script lang="ts">
	import { onMount } from 'svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import NodeContainer from './NodeContainer.svelte';
	import { getIntrinsicScaleFactor, getParallaxFactor } from '$lib/utils/depth';
	import {
		FOCAL_PLANE_TARGET_SCALE,
		DOF_FOCUSED_SHARPNESS_FACTOR,
		DOF_EXPLORATION_SHARPNESS_FACTOR,
		DEPTH_BLUR_THRESHOLD,
		DEPTH_BLUR_MULTIPLIER,
		DEPTH_BLUR_FACTOR,
		MAX_DEPTH_BLUR,
		DEPTH_OPACITY_REDUCTION,
		MIN_DEPTH_OPACITY,
		ZOOM_IN_BLUR_THRESHOLD,
		ZOOM_IN_BLUR_MULTIPLIER
	} from '$lib/constants';
	import { getViewportContext } from '$lib/contexts/viewportContext';
	import { zoom, offsetX, offsetY } from '$lib/stores/viewportStore';

	// --- Reactive State ---
	const boxes = $derived(canvasStore.boxes);
	const draggingBoxId = $derived(canvasStore.draggingBoxId);
	const zoomedBoxId = $derived(canvasStore.zoomedBoxId);
	const apertureEnabled = $derived(canvasStore.apertureEnabled);

	// --- Viewport dimensions ---
	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	onMount(() => {
		const viewportContext = getViewportContext();
		const unsubWidth = viewportContext.width.subscribe((w) => (viewportWidth = w));
		const unsubHeight = viewportContext.height.subscribe((h) => (viewportHeight = h));
		return () => {
			unsubWidth();
			unsubHeight();
		};
	});

	// Performance optimization: throttle transform updates
	let transformUpdateFrame: number | null = null;
	let cachedTransform = '';

	function updateTransform() {
		if (transformUpdateFrame) return;
		transformUpdateFrame = requestAnimationFrame(() => {
			const newTransform = `translate(${$offsetX}px, ${$offsetY}px) scale(${$zoom})`;
			if (newTransform !== cachedTransform) {
				cachedTransform = newTransform;
				// Transform will be applied via reactive statement
			}
			transformUpdateFrame = null;
		});
	}

	// React to viewport changes
	$effect(() => {
		$zoom;
		$offsetX;
		$offsetY;
		updateTransform();
	});

	// --- Depth Effect Calculations (based on global zoom) ---

	// --- Transform & Filter String Generation ---

	function getLayerStyles(z: number, isDraggingLayer = false) {
		// Use 1.0 parallax factor for dragging layers to disable parallax
		const parallaxFactor = isDraggingLayer ? 1.0 : getParallaxFactor(z);

		// --- Centered Parallax Calculation ---
		// This adjusts the offset to make the parallax effect originate from the
		// center of the viewport, rather than the top-left corner.
		const parallaxCorrectionX = (viewportWidth / 2) * (1 - parallaxFactor);
		const parallaxCorrectionY = (viewportHeight / 2) * (1 - parallaxFactor);
		const parallaxOffsetX = $offsetX * parallaxFactor + parallaxCorrectionX;
		const parallaxOffsetY = $offsetY * parallaxFactor + parallaxCorrectionY;

		// The layer's intrinsic scale based on its depth
		const intrinsicScale = getIntrinsicScaleFactor(z);

		// The final, total scale of the layer, combining global zoom and intrinsic scale
		const totalEffectiveScale = $zoom * intrinsicScale;

		// The layer's transform
		const transform = `translate(${parallaxOffsetX}px, ${parallaxOffsetY}px) scale(${totalEffectiveScale})`;

		// --- Depth of Field Effects ---
		// Calculate how far this layer's effective scale is from the ideal focal plane.
		const focusDelta = Math.abs(FOCAL_PLANE_TARGET_SCALE - totalEffectiveScale);

		// Dynamic depth of field - more dramatic when a node is focused
		const isFocused = zoomedBoxId !== null;
		const dofSharpnessFactor = isFocused
			? DOF_FOCUSED_SHARPNESS_FACTOR
			: DOF_EXPLORATION_SHARPNESS_FACTOR;
		const maxBlur = isFocused ? 16 : 8; // Higher blur when focused for dramatic effect

		let blurAmount = 0;
		// Apply DOF blur only to foreground (positive z) layers or when a node is actively focused.
		if (z > 0 || isFocused) {
			blurAmount = Math.min(maxBlur, focusDelta * dofSharpnessFactor);
		}

		/*
		 * Previous behaviour blurred distant BACKGROUND layers (negative-z) when zoomed out.
		 * To keep background nodes readable we now apply that extra zoom-dependent blur
		 * only to foreground / positive-z layers.
		 */
		if (z > 0) {
			const zoomFactor = 1 / Math.max(0.1, $zoom); // decreases as you zoom in
			const depthFactor = z; // higher z ⇒ closer ⇒ more blur
			const zoomBlur = depthFactor * DEPTH_BLUR_MULTIPLIER * zoomFactor;

			blurAmount += Math.min(MAX_DEPTH_BLUR - blurAmount, zoomBlur);

			// Extra blur when the camera is zoomed in very close to the scene
			if ($zoom > ZOOM_IN_BLUR_THRESHOLD && z >= 0) {
				const zoomInFactor = $zoom - ZOOM_IN_BLUR_THRESHOLD;
				const zoomedInBlur = zoomInFactor * ZOOM_IN_BLUR_MULTIPLIER;
				blurAmount += Math.min(MAX_DEPTH_BLUR - blurAmount, zoomedInBlur);
			}
		}

		const brightness = Math.max(0.5, 1.0 - focusDelta * 0.6);

		// If aperture effect is disabled and we're not in focus mode, disable blur.
		if (!apertureEnabled && !isFocused) {
			blurAmount = 0;
		}

		const filters = [];
		if (blurAmount > 0.05) filters.push(`blur(${blurAmount}px)`);
		if (brightness < 0.99) filters.push(`brightness(${brightness})`);
		const filter = filters.length > 0 ? filters.join(' ') : 'none';

		// Opacity is now also a function of the focus delta, but only for foreground items.
		// Layers fade out as they become more out-of-focus.
		let opacity = 1.0;
		if (z > 0) {
			opacity = Math.max(0, 1.0 - focusDelta * 0.8);
		}

		// Additional zoom-dependent opacity reduction for very far back nodes to enhance depth perception
		if (z <= DEPTH_BLUR_THRESHOLD) {
			const zoomFactor = 1 / Math.max(0.1, $zoom); // Inverse of zoom
			const depthFactor = Math.abs(z) - Math.abs(DEPTH_BLUR_THRESHOLD); // How many levels below threshold
			const zoomDependentOpacityReduction =
				depthFactor * DEPTH_OPACITY_REDUCTION * Math.min(2, zoomFactor); // Cap zoom factor for opacity
			opacity = Math.max(MIN_DEPTH_OPACITY, opacity - zoomDependentOpacityReduction); // Don't go below minimum opacity
		}

		return { transform, filter, opacity, zIndex: z + 100 };
	}

	// --- Data Grouping ---

	const { normalBoxesByZ, draggingBox } = $derived.by(() => {
		const groups = new Map<number, AppBoxState[]>();
		let draggingBox: AppBoxState | null = null;

		boxes.forEach((box) => {
			if (box.id === draggingBoxId) {
				draggingBox = box;
			} else {
				if (!groups.has(box.z)) {
					groups.set(box.z, []);
				}
				groups.get(box.z)!.push(box);
			}
		});

		return {
			normalBoxesByZ: Array.from(groups.entries()).sort(([a], [b]) => a - b),
			draggingBox
		};
	});
</script>

<!-- Render each Z-layer with its own parallax transform -->
{#each normalBoxesByZ as [z, layerBoxes] (z)}
	{@const styles = getLayerStyles(z)}
	<div
		class="world-layer"
		style:transform={styles.transform}
		style:filter={styles.filter}
		style:z-index={styles.zIndex}
		style:opacity={styles.opacity}
	>
		{#each layerBoxes as box (box.id)}
			<NodeContainer {box} />
		{/each}
	</div>
{/each}

<!-- Render dragging box separately with no parallax -->
{#if draggingBox}
	{@const styles = getLayerStyles(draggingBox.z, true)}
	<div
		class="world-layer dragging-layer"
		style:transform={styles.transform}
		style:filter={styles.filter}
		style:z-index={1000}
		style:opacity={styles.opacity}
	>
		<NodeContainer box={draggingBox} />
	</div>
{/if}

<style>
	.world-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		transform-origin: 0 0;
		pointer-events: none;
		/* Performance optimizations for smooth transforms */
		will-change: transform, filter, opacity;
		transform-style: preserve-3d;
		backface-visibility: hidden;
		/* Transitions are now handled by the main animation loop in the viewport for smoothness */
	}

	.dragging-layer {
		/* Dragging layer gets highest z-index and direct 1:1 movement */
		pointer-events: none; /* Let clicks pass through the layer itself */
		/* Subtle visual feedback that parallax is suspended */
		filter: drop-shadow(0 0 8px rgba(74, 144, 226, 0.3));
	}

	.dragging-layer :global(.box) {
		/* Re-enable pointer events for the actual box being dragged */
		pointer-events: auto;
	}
</style>
