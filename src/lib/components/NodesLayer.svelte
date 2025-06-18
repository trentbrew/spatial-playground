<script lang="ts">
	import { onMount } from 'svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import NodeContainer from './NodeContainer.svelte';
	import { getIntrinsicScaleFactor, getParallaxFactor } from '$lib/utils/depth';
	import { FOCAL_PLANE_TARGET_SCALE, DOF_SHARPNESS_FACTOR } from '$lib/constants';
	import { getViewportContext } from '$lib/contexts/viewportContext';

	// --- Reactive State ---
	const zoom = $derived(canvasStore.zoom);
	const offsetX = $derived(canvasStore.offsetX);
	const offsetY = $derived(canvasStore.offsetY);
	const boxes = $derived(canvasStore.boxes);
	const draggingBoxId = $derived(canvasStore.draggingBoxId);

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
		const parallaxOffsetX = offsetX * parallaxFactor + parallaxCorrectionX;
		const parallaxOffsetY = offsetY * parallaxFactor + parallaxCorrectionY;

		// The layer's intrinsic scale based on its depth
		const intrinsicScale = getIntrinsicScaleFactor(z);

		// The final, total scale of the layer, combining global zoom and intrinsic scale
		const totalEffectiveScale = zoom * intrinsicScale;

		// The layer's transform
		const transform = `translate(${parallaxOffsetX}px, ${parallaxOffsetY}px) scale(${totalEffectiveScale})`;

		// --- Depth of Field Effects ---
		// Calculate how far this layer's effective scale is from the ideal focal plane.
		const focusDelta = Math.abs(FOCAL_PLANE_TARGET_SCALE - totalEffectiveScale);

		// Blur and brightness are functions of this focus delta.
		// Increased blur cap and more dramatic brightness drop-off
		const blurAmount = Math.min(16, focusDelta * DOF_SHARPNESS_FACTOR);
		const brightness = Math.max(0.5, 1.0 - focusDelta * 0.6);

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
		/* Transitions are now handled by the main animation loop in the viewport for smoothness */
	}

	.dragging-layer {
		/* Dragging layer gets highest z-index and direct 1:1 movement */
		pointer-events: auto;
		/* Subtle visual feedback that parallax is suspended */
		filter: drop-shadow(0 0 8px rgba(74, 144, 226, 0.3));
	}
</style>
