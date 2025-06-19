<script lang="ts">
	import CanvasViewport from '$lib/components/CanvasViewport.svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { getFocusZoomForZ, getIntrinsicScaleFactor, getParallaxFactor } from '$lib/utils/depth';
	import { onMount } from 'svelte';

	// Disable native zoom gesture (pinch-zoom and double-tap zoom) for main document and embedded content
	onMount(() => {
		// Prevent pinch-zoom and double-tap zoom on mobile/touch devices
		const preventZoom = (e: TouchEvent) => {
			if (e.touches.length > 1) {
				e.preventDefault();
			}
		};
		const preventDoubleTapZoom = (e: Event) => {
			e.preventDefault();
		};

		const preventWheelZoom = (e: WheelEvent) => {
			if (e.ctrlKey) {
				e.preventDefault();
			}
		};

		// Helper to add listeners to a document (main or embedded)
		function addZoomPreventionListeners(doc: Document) {
			doc.addEventListener('touchmove', preventZoom, { passive: false });
			doc.addEventListener('gesturestart', preventDoubleTapZoom);
			doc.addEventListener('gesturechange', preventDoubleTapZoom);
			doc.addEventListener('gestureend', preventDoubleTapZoom);
			doc.addEventListener('wheel', preventWheelZoom, { passive: false });
		}

		// Helper to remove listeners from a document
		function removeZoomPreventionListeners(doc: Document) {
			doc.removeEventListener('touchmove', preventZoom);
			doc.removeEventListener('gesturestart', preventDoubleTapZoom);
			doc.removeEventListener('gesturechange', preventDoubleTapZoom);
			doc.removeEventListener('gestureend', preventDoubleTapZoom);
			doc.removeEventListener('wheel', preventWheelZoom);
		}

		// Add to main document
		addZoomPreventionListeners(document);

		// Add to all iframes/embeds (embedded content)
		const embeddedDocs: Document[] = [];
		const embeddedElements = Array.from(document.querySelectorAll('iframe, embed, object'));
		for (const el of embeddedElements) {
			try {
				// Only same-origin iframes/embeds are accessible
				const doc = (el as HTMLIFrameElement).contentDocument;
				if (doc) {
					addZoomPreventionListeners(doc);
					embeddedDocs.push(doc);
				}
			} catch (err) {
				// Cross-origin, ignore
			}
		}

		// Expose debugging tools to window object
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

		return () => {
			removeZoomPreventionListeners(document);
			for (const doc of embeddedDocs) {
				removeZoomPreventionListeners(doc);
			}
		};
	});
</script>

<CanvasViewport />
