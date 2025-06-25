import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import { get } from 'svelte/store';
import { zoom as zoomStore, offsetX, offsetY } from '$lib/stores/viewportStore';

// Constants
const ZOOM_SPEED_FACTOR = 0.005;
const ZOOM_ANIMATION_DURATION = 150; // ms - smooth zoom animation
const VELOCITY_SAMPLE_SIZE = 3; // Number of recent events to track for velocity
const FAST_GESTURE_THRESHOLD = 300; // deltaY units per second to be considered "fast"
const VELOCITY_ZOOM_MULTIPLIER = 2.5; // How much more to zoom on fast gestures

// Helper for smooth zoom animation (only for discrete actions, not continuous gestures)
let zoomAnimationFrame: number | null = null;
function animateZoomTo(targetZoom: number, duration = 200) {
	if (zoomAnimationFrame) cancelAnimationFrame(zoomAnimationFrame);
	const startZoom = canvasStore.zoom;
	const startTime = performance.now();
	function animate(now: number) {
		const elapsed = now - startTime;
		const t = Math.min(elapsed / duration, 1);
		const eased = t < 1 ? 1 - Math.pow(1 - t, 2) : 1;
		const currentZoom = startZoom + (targetZoom - startZoom) * eased;
		canvasStore.setZoom(currentZoom);
		if (t < 1) {
			zoomAnimationFrame = requestAnimationFrame(animate);
		}
	}
	zoomAnimationFrame = requestAnimationFrame(animate);
}

export const zooming: Action<HTMLElement, { preventDefault?: boolean } | undefined> = (
	node,
	params
) => {
	const preventDefault = params?.preventDefault ?? true;

	// Velocity tracking
	let recentEvents: Array<{ deltaY: number; timestamp: number }> = [];

	function calculateGestureVelocity(currentEvent: { deltaY: number; timestamp: number }): number {
		// Add current event to recent events
		recentEvents.push(currentEvent);

		// Keep only the most recent events
		if (recentEvents.length > VELOCITY_SAMPLE_SIZE) {
			recentEvents.shift();
		}

		// Need at least 2 events to calculate velocity
		if (recentEvents.length < 2) {
			return 0;
		}

		// Calculate velocity based on recent events
		const oldestEvent = recentEvents[0];
		const newestEvent = recentEvents[recentEvents.length - 1];
		const timeDiff = newestEvent.timestamp - oldestEvent.timestamp;

		if (timeDiff === 0) return 0;

		// Sum up total deltaY over the time period
		const totalDelta = recentEvents.reduce((sum, event) => sum + Math.abs(event.deltaY), 0);
		const velocity = totalDelta / (timeDiff / 1000); // units per second

		return velocity;
	}

	// --- Smooth Zooming Helpers ---

	let targetZoomValue = canvasStore.zoom;
	let smoothZoomRaf: number | null = null;

	function smoothZoomStep() {
		const current = canvasStore.zoom;
		const diff = targetZoomValue - current;
		if (Math.abs(diff) < 0.001) {
			// Close enough – snap to target and stop
			canvasStore.setZoom(targetZoomValue);
			smoothZoomRaf = null;
			return;
		}
		// Ease by moving a fraction of the remaining distance
		canvasStore.setZoom(current + diff * 0.2);
		smoothZoomRaf = requestAnimationFrame(smoothZoomStep);
	}

	function kickSmoothZoom() {
		if (smoothZoomRaf === null) {
			smoothZoomRaf = requestAnimationFrame(smoothZoomStep);
		}
	}

	function handleWheel(event: WheelEvent) {
		if (preventDefault) {
			event.preventDefault();
		}

		// Pinch / trackpad zoom are reported as wheel events with ctrlKey (macOS & others)
		const isZoomGesture = event.ctrlKey || event.metaKey;

		if (isZoomGesture) {
			// Anchor zoom to cursor / gesture center
			const rect = node.getBoundingClientRect();
			const cursorX = event.clientX - rect.left;
			const cursorY = event.clientY - rect.top;

			const currentZoom = get(zoomStore);
			const currentOffsetX = get(offsetX);
			const currentOffsetY = get(offsetY);

			// Delta zoom factor (trackpad usually small deltas)
			const zoomDelta = -event.deltaY * 0.0015; // tune sensitivity
			let newZoom = currentZoom * (1 + zoomDelta);
			newZoom = Math.max(0.1, Math.min(5, newZoom));

			// Compute world coordinates under cursor before zoom
			const worldX = (cursorX - currentOffsetX) / currentZoom;
			const worldY = (cursorY - currentOffsetY) / currentZoom;

			// Compute new offsets so that world point stays under cursor
			const newOffsetX = cursorX - worldX * newZoom;
			const newOffsetY = cursorY - worldY * newZoom;

			// Apply
			offsetX.set(newOffsetX);
			offsetY.set(newOffsetY);
			const shouldUnfocus = canvasStore.zoomedBoxId !== null;
			canvasStore.setZoom(newZoom, {
				maintainFocus: false,
				autoUnfocus: shouldUnfocus
			});
			return;
		}

		// --- Pan (two-finger swipe) ---
		const panDeltaX = -event.deltaX * 0.5;
		const panDeltaY = -event.deltaY * 0.5;

		canvasStore.panBy(panDeltaX, panDeltaY);
	}

	// Clear velocity tracking after a period of inactivity
	let velocityResetTimeout: number | null = null;
	function resetVelocityTracking() {
		if (velocityResetTimeout) {
			clearTimeout(velocityResetTimeout);
		}
		velocityResetTimeout = setTimeout(() => {
			recentEvents = [];
		}, 500) as unknown as number; // Reset after 500ms of inactivity
	}

	node.addEventListener('wheel', handleWheel, { passive: false });
	return {
		destroy() {
			node.removeEventListener('wheel', handleWheel);
			if (velocityResetTimeout) {
				clearTimeout(velocityResetTimeout);
			}
			if (smoothZoomRaf) {
				cancelAnimationFrame(smoothZoomRaf);
			}
		}
	};
};
