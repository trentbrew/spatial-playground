import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import { get } from 'svelte/store';
import { zoom as zoomStore, offsetX, offsetY } from '$lib/stores/viewportStore';
import { canvasZeroAdapter } from '$lib/stores/canvasZeroAdapter';

// Optimized constants
const ZOOM_SPEED_FACTOR = 0.002; // Slightly reduced for better control
const ZOOM_ANIMATION_DURATION = 120; // Reduced for more responsive feel
const VELOCITY_SAMPLE_SIZE = 2; // Reduced for more responsive calculations
const FAST_GESTURE_THRESHOLD = 200; // Lowered threshold for better sensitivity
const VELOCITY_ZOOM_MULTIPLIER = 2.0; // Slightly reduced
const RESUME_DEBOUNCE_DELAY = 200; // Faster than panning for zoom responsiveness
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;

// Performance debugging
const ENABLE_ZOOM_LOGGING = false; // Set to true for debugging
let zoomEventCount = 0;
let zoomStartTime = 0;
let totalZoomUpdates = 0;

function logZoomPerformance(action: string, data?: any) {
	if (!ENABLE_ZOOM_LOGGING) return;
	console.log(`[ZOOMING] ${action}:`, data);
}

// Global animation state
let zoomAnimationFrame: number | null = null;
let smoothZoomRaf: number | null = null;

// Optimized zoom animation with early termination
function animateZoomTo(targetZoom: number, duration = ZOOM_ANIMATION_DURATION) {
	if (zoomAnimationFrame) cancelAnimationFrame(zoomAnimationFrame);

	const startZoom = canvasStore.zoom;
	const startTime = performance.now();
	const zoomDelta = targetZoom - startZoom;

	// Early exit if zoom change is negligible
	if (Math.abs(zoomDelta) < 0.001) return;

	function animate(now: number) {
		const elapsed = now - startTime;
		const t = Math.min(elapsed / duration, 1);

		// Use cubic easing for smoother feel
		const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		const currentZoom = startZoom + zoomDelta * eased;

		canvasStore.setZoom(currentZoom);

		if (t < 1) {
			zoomAnimationFrame = requestAnimationFrame(animate);
		} else {
			zoomAnimationFrame = null;
		}
	}
	zoomAnimationFrame = requestAnimationFrame(animate);
}

export const zooming: Action<HTMLElement, { preventDefault?: boolean } | undefined> = (
	node,
	params
) => {
	const preventDefault = params?.preventDefault ?? true;

	// Adapter pause/resume optimization
	let resumeTimeout: ReturnType<typeof setTimeout> | null = null;
	let isPaused = false;

	function pauseAdapter() {
		if (!isPaused) {
			canvasZeroAdapter.pause();
			isPaused = true;
		}
	}

	function debouncedResumePolling() {
		if (resumeTimeout) clearTimeout(resumeTimeout);
		resumeTimeout = setTimeout(() => {
			if (isPaused) {
				canvasZeroAdapter.resume();
				isPaused = false;
			}
		}, RESUME_DEBOUNCE_DELAY);
	}

	// Optimized velocity tracking
	let recentEvents: Array<{ deltaY: number; timestamp: number }> = [];
	function calculateGestureVelocity(currentEvent: { deltaY: number; timestamp: number }): number {
		recentEvents.push(currentEvent);

		// Keep only recent events
		const cutoff = currentEvent.timestamp - 100; // 100ms window
		recentEvents = recentEvents.filter((event) => event.timestamp > cutoff);

		if (recentEvents.length < 2) return 0;

		const oldest = recentEvents[0];
		const newest = recentEvents[recentEvents.length - 1];
		const timeDiff = newest.timestamp - oldest.timestamp;

		if (timeDiff === 0) return 0;

		const totalDelta = recentEvents.reduce((sum, ev) => sum + Math.abs(ev.deltaY), 0);
		return totalDelta / (timeDiff / 1000);
	}

	// Optimized smooth zoom with reduced complexity
	let targetZoomValue = canvasStore.zoom;

	function smoothZoomStep() {
		const current = canvasStore.zoom;
		const diff = targetZoomValue - current;

		// More aggressive convergence threshold
		if (Math.abs(diff) < 0.002) {
			canvasStore.setZoom(targetZoomValue);
			smoothZoomRaf = null;
			return;
		}

		// Faster convergence for more responsive feel
		canvasStore.setZoom(current + diff * 0.3);
		smoothZoomRaf = requestAnimationFrame(smoothZoomStep);
	}

	function kickSmoothZoom() {
		if (smoothZoomRaf === null) {
			smoothZoomRaf = requestAnimationFrame(smoothZoomStep);
		}
	}

	// Cached viewport values to reduce store reads
	let cachedZoom = get(zoomStore);
	let cachedOffsetX = get(offsetX);
	let cachedOffsetY = get(offsetY);
	let cacheUpdateFrame: number | null = null;

	function updateCache() {
		if (cacheUpdateFrame) return;
		cacheUpdateFrame = requestAnimationFrame(() => {
			cachedZoom = get(zoomStore);
			cachedOffsetX = get(offsetX);
			cachedOffsetY = get(offsetY);
			cacheUpdateFrame = null;
		});
	}

	function handleWheel(event: WheelEvent) {
		pauseAdapter();
		debouncedResumePolling();

		if (preventDefault) event.preventDefault();

		// Performance tracking
		if (zoomEventCount === 0) {
			zoomStartTime = performance.now();
		}
		zoomEventCount++;

		const isZoomGesture = event.ctrlKey || event.metaKey;

		if (isZoomGesture) {
			totalZoomUpdates++;

			// Cache rect to avoid repeated DOM queries
			const rect = node.getBoundingClientRect();
			const cursorX = event.clientX - rect.left;
			const cursorY = event.clientY - rect.top;

			// Use cached values for better performance
			updateCache();

			// Optimized zoom calculation
			const zoomDelta = -event.deltaY * ZOOM_SPEED_FACTOR;
			let newZoom = cachedZoom * (1 + zoomDelta);

			// Clamp zoom with early exit
			const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
			if (Math.abs(clampedZoom - cachedZoom) < 0.001) {
				logZoomPerformance('Zoom Skipped (negligible)', {
					oldZoom: cachedZoom,
					newZoom: clampedZoom,
					delta: zoomDelta
				});
				return; // Skip negligible changes
			}

			newZoom = clampedZoom;

			// Calculate world coordinates
			const worldX = (cursorX - cachedOffsetX) / cachedZoom;
			const worldY = (cursorY - cachedOffsetY) / cachedZoom;

			// Calculate new offsets
			const newOffsetX = cursorX - worldX * newZoom;
			const newOffsetY = cursorY - worldY * newZoom;

			logZoomPerformance('Zoom Applied', {
				oldZoom: cachedZoom,
				newZoom,
				delta: zoomDelta,
				cursor: { x: cursorX, y: cursorY },
				world: { x: worldX, y: worldY }
			});

			// Batch the updates
			offsetX.set(newOffsetX);
			offsetY.set(newOffsetY);

			const shouldUnfocus = canvasStore.zoomedBoxId !== null;
			canvasStore.setZoom(newZoom, {
				maintainFocus: false,
				autoUnfocus: shouldUnfocus
			});

			// Update cache immediately for next event
			cachedZoom = newZoom;
			cachedOffsetX = newOffsetX;
			cachedOffsetY = newOffsetY;

			return;
		}

		// Optimized panning - use smaller multiplier for more control
		const panDeltaX = -event.deltaX * 0.4;
		const panDeltaY = -event.deltaY * 0.4;

		if (Math.abs(panDeltaX) > 0.1 || Math.abs(panDeltaY) > 0.1) {
			logZoomPerformance('Wheel Pan', { deltaX: panDeltaX, deltaY: panDeltaY });
			canvasStore.panBy(panDeltaX, panDeltaY);
		}
	}

	// Optimized velocity reset with longer timeout
	let velocityResetTimeout: number | null = null;
	function resetVelocityTracking() {
		if (velocityResetTimeout) clearTimeout(velocityResetTimeout);
		velocityResetTimeout = setTimeout(() => {
			recentEvents = [];
		}, 300) as unknown as number; // Slightly longer for better tracking
	}

	// Set up initial cache
	updateCache();

	node.addEventListener('wheel', handleWheel, { passive: false });

	return {
		destroy() {
			node.removeEventListener('wheel', handleWheel);

			// Clean up timeouts
			if (velocityResetTimeout) clearTimeout(velocityResetTimeout);
			if (resumeTimeout) clearTimeout(resumeTimeout);

			// Clean up animation frames
			if (smoothZoomRaf) cancelAnimationFrame(smoothZoomRaf);
			if (zoomAnimationFrame) cancelAnimationFrame(zoomAnimationFrame);
			if (cacheUpdateFrame) cancelAnimationFrame(cacheUpdateFrame);

			// Ensure adapter is resumed
			if (isPaused) {
				canvasZeroAdapter.resume();
				isPaused = false;
			}
		}
	};
};
