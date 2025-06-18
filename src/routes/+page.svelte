<script lang="ts">
	import CanvasViewport from '$lib/components/CanvasViewport.svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { getFocusZoomForZ, getIntrinsicScaleFactor, getParallaxFactor } from '$lib/utils/depth';
	import { onMount } from 'svelte';

	// Expose debugging tools to window object
	onMount(() => {
		if (typeof window !== 'undefined') {
			window.canvasStore = canvasStore;
			window.getFocusZoomForZ = getFocusZoomForZ;
			window.getIntrinsicScaleFactor = getIntrinsicScaleFactor;
			window.getParallaxFactor = getParallaxFactor;

			// Load debug tools
			import('$lib/debug/animationTest.js').then((module) => {
				window.runAnimationTests = module.runAnimationTests;
				console.log('🧪 Animation test suite ready. Run runAnimationTests() in console.');
			});

			import('$lib/debug/animationTracer.js').then((module) => {
				console.log('🔍 Animation tracer ready. Run traceZoomToBox() in console.');
			});
		}
	});
</script>

<CanvasViewport />
