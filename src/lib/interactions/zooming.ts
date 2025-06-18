import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore.svelte';

// Constants
const ZOOM_SPEED_FACTOR = 0.005;
const ZOOM_ANIMATION_DURATION = 150; // ms - smooth zoom animation
const VELOCITY_SAMPLE_SIZE = 3; // Number of recent events to track for velocity
const FAST_GESTURE_THRESHOLD = 300; // deltaY units per second to be considered "fast"
const VELOCITY_ZOOM_MULTIPLIER = 2.5; // How much more to zoom on fast gestures

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

	function handleWheel(event: WheelEvent) {
		// Disable zooming if a box is fullscreen
		if (canvasStore.fullscreenBoxId !== null) {
			return;
		}

		if (preventDefault) {
			event.preventDefault();
		}

		const isZoomGesture = event.ctrlKey || event.metaKey;

		if (isZoomGesture) {
			// Track gesture velocity
			const currentEvent = { deltaY: Math.abs(event.deltaY), timestamp: Date.now() };
			const velocity = calculateGestureVelocity(currentEvent);
			// --- Zoom Logic (Ctrl/Meta + Scroll) ---
			const rect = node.getBoundingClientRect();
			const mouseX = event.clientX - rect.left;
			const mouseY = event.clientY - rect.top;

			const currentZoom = canvasStore.zoom;
			const currentOffsetX = canvasStore.offsetX;
			const currentOffsetY = canvasStore.offsetY;

			const worldX = (mouseX - currentOffsetX) / currentZoom;
			const worldY = (mouseY - currentOffsetY) / currentZoom;

			// Adaptive zoom factor based on gesture velocity
			const isFastGesture = velocity > FAST_GESTURE_THRESHOLD;
			const baseZoomFactor = 1.05; // Base zoom factor for slow gestures
			const adaptiveZoomFactor = isFastGesture
				? Math.min(baseZoomFactor + (baseZoomFactor - 1) * VELOCITY_ZOOM_MULTIPLIER, 1.25) // Cap at 1.25 for fast gestures
				: baseZoomFactor;

			const newZoom = Math.max(
				0.1,
				Math.min(currentZoom * (event.deltaY < 0 ? adaptiveZoomFactor : 1 / adaptiveZoomFactor), 10)
			);

			// Debug logging (remove in production)
			if (isFastGesture) {
				console.log(
					`🚀 Fast gesture detected! Velocity: ${velocity.toFixed(0)}, Zoom factor: ${adaptiveZoomFactor.toFixed(3)}`
				);
			}

			const newOffsetX = mouseX - worldX * newZoom;
			const newOffsetY = mouseY - worldY * newZoom;

			// Use smooth animated zoom instead of instant
			canvasStore.setTargetViewportAnimated(
				{ zoom: newZoom, x: newOffsetX, y: newOffsetY },
				ZOOM_ANIMATION_DURATION
			);

			// Reset velocity tracking after inactivity
			resetVelocityTracking();
		} else {
			// --- Pan Logic (Standard Scroll/Trackpad Swipe) ---
			canvasStore.panBy(-event.deltaX, -event.deltaY);
			// Clear velocity tracking for non-zoom gestures
			recentEvents = [];
		}
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
		}
	};
};
