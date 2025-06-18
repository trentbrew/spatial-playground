<script lang="ts">
	import type { AppBoxState } from '$lib/canvasState';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import NodeContainer from './NodeContainer.svelte';

	// --- Reactive State ---
	const zoom = $derived(canvasStore.zoom);
	const offsetX = $derived(canvasStore.offsetX);
	const offsetY = $derived(canvasStore.offsetY);
	const boxes = $derived(canvasStore.boxes);
	const selectedBoxId = $derived(canvasStore.selectedBoxId);

	// Determine the Z-level that is currently in focus
	const focusedZ = $derived(() => {
		if (selectedBoxId === null) return 0; // Default focus plane is at z=0
		const selectedBox = boxes.find((b) => b.id === selectedBoxId);
		return selectedBox ? selectedBox.z : 0;
	});

	// --- Depth Effect Calculations (relative to focusedZ) ---

	// Parallax is based on absolute depth, not focus. It's a property of the layer itself.
	function getParallaxFactor(z: number): number {
		if (z >= 0) return 1.0;
		return Math.max(0.1, 1.0 + z * 0.3);
	}

	// Scale is now relative to the focus plane.
	function getScaleFactor(z: number, currentFocusedZ: number): number {
		const relativeZ = z - currentFocusedZ;
		if (relativeZ === 0) return 1.0; // The focused layer is at normal size
		// Layers behind the focus plane get smaller.
		return Math.max(0.3, 1.0 - Math.abs(relativeZ) * 0.15);
	}

	// Blur is applied to any layer not on the focus plane.
	function getBlurAmount(z: number, currentFocusedZ: number): number {
		const relativeZ = z - currentFocusedZ;
		if (relativeZ === 0) return 0; // No blur on the focused layer
		// Blur increases the further away from the focus plane.
		return Math.min(8, Math.abs(relativeZ) * 2.5);
	}

	// Brightness is also relative to the focus plane.
	function getBrightness(z: number, currentFocusedZ: number): number {
		const relativeZ = z - currentFocusedZ;
		if (relativeZ === 0) return 1.0; // Full brightness on focused layer
		return Math.max(0.6, 1.0 - Math.abs(relativeZ) * 0.1);
	}

	// --- Transform & Filter String Generation ---

	function getLayerStyles(z: number, currentFocusedZ: number) {
		// Parallax transform
		const parallaxFactor = getParallaxFactor(z);
		const parallaxOffsetX = offsetX * parallaxFactor;
		const parallaxOffsetY = offsetY * parallaxFactor;

		// Depth-based scale
		const scaleFactor = getScaleFactor(z, currentFocusedZ);
		const totalScale = zoom * scaleFactor;
		const transform = `translate(${parallaxOffsetX}px, ${parallaxOffsetY}px) scale(${totalScale})`;

		// Depth-based filters
		const blurAmount = getBlurAmount(z, currentFocusedZ);
		const brightness = getBrightness(z, currentFocusedZ);

		const filters = [];
		if (blurAmount > 0) filters.push(`blur(${blurAmount}px)`);
		if (brightness < 1.0) filters.push(`brightness(${brightness})`);
		const filter = filters.length > 0 ? filters.join(' ') : 'none';

		// Opacity for background layers (absolute, not relative)
		const opacity = z < 0 ? Math.max(0.4, 1 + z * 0.15) : 1.0;

		return { transform, filter, opacity, zIndex: z + 100 };
	}

	// --- Data Grouping ---

	const boxesByZ = $derived(() => {
		const groups = new Map<number, AppBoxState[]>();
		boxes.forEach((box) => {
			if (!groups.has(box.z)) {
				groups.set(box.z, []);
			}
			groups.get(box.z)!.push(box);
		});
		return Array.from(groups.entries()).sort(([a], [b]) => a - b);
	});
</script>

<!-- Render each Z-layer with its own parallax transform -->
{#each boxesByZ() as [z, layerBoxes] (z)}
	{@const styles = getLayerStyles(z, focusedZ())}
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

<style>
	.world-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		transform-origin: 0 0;
		pointer-events: none;
		transition:
			opacity 0.4s ease,
			filter 0.4s ease,
			transform 0.4s ease; /* Animate transform for smooth focus shifts */
	}
</style>
