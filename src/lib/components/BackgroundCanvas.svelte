<script lang="ts">
	import { zoom, offsetX, offsetY } from '$lib/stores/viewportStore';

	// Simple solid background - no complex grid system needed
	// Performance optimization: throttle style updates
	let redrawFrame: number | null = null;
	let needsRedraw = false;

	function scheduleRedraw() {
		if (redrawFrame) return; // Already scheduled
		needsRedraw = true;
		redrawFrame = requestAnimationFrame(() => {
			needsRedraw = false;
			redrawFrame = null;
		});
	}

	// Subscribe to viewport changes and schedule redraws
	$effect(() => {
		// React to zoom, offsetX, offsetY changes
		$zoom;
		$offsetX;
		$offsetY;
		scheduleRedraw();
	});
</script>

<div class="background-canvas"></div>

<style>
	.background-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		background-color: var(--bg-canvas-color);
	}
</style>
