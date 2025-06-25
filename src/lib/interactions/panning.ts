import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import { canvasZeroAdapter } from '$lib/stores/canvasZeroAdapter';

// Performance constants
const PAN_BATCH_INTERVAL = 16; // ~60fps batching
const RESUME_DEBOUNCE_DELAY = 250; // Reduced from 300ms for faster responsiveness
const VELOCITY_DAMPING = 0.95; // For momentum scrolling

// Performance debugging
const ENABLE_PERFORMANCE_LOGGING = false; // Set to true for debugging
let panStartTime = 0;
let panEventCount = 0;
let totalPanUpdates = 0;

function logPanPerformance(action: string, data?: any) {
	if (!ENABLE_PERFORMANCE_LOGGING) return;
	console.log(`[PANNING] ${action}:`, data);
}

export const panning: Action<HTMLElement> = (node) => {
	let isPanning = false;
	let isSpacebarHeld = false;
	let startX = 0;
	let startY = 0;

	// Touch handling state
	let touchStartX: number | null = null;
	let touchStartY: number | null = null;

	// Optimized batching state
	let panUpdateFrame: number | null = null;
	let pendingPanX = 0;
	let pendingPanY = 0;
	let lastPanTime = 0;

	// Momentum scrolling state
	let velocityX = 0;
	let velocityY = 0;
	let momentumFrame: number | null = null;

	// Adapter pause/resume optimization
	let resumeTimeout: ReturnType<typeof setTimeout> | null = null;
	let isPaused = false;

	// Optimized pause function - only pause if not already paused
	function pauseAdapter() {
		if (!isPaused) {
			canvasZeroAdapter.pause();
			isPaused = true;
		}
	}

	// Optimized resume function with better debouncing
	function debouncedResume() {
		if (resumeTimeout) clearTimeout(resumeTimeout);
		resumeTimeout = setTimeout(() => {
			if (isPaused) {
				canvasZeroAdapter.resume();
				isPaused = false;
			}
		}, RESUME_DEBOUNCE_DELAY);
	}

	// Optimized pan update with better batching
	function schedulePanUpdate() {
		if (panUpdateFrame) return; // Already scheduled

		panUpdateFrame = requestAnimationFrame(() => {
			const now = performance.now();
			totalPanUpdates++;

			// Apply pending pan movement
			if (Math.abs(pendingPanX) > 0.1 || Math.abs(pendingPanY) > 0.1) {
				const currentZoom = canvasStore.zoom;
				canvasStore.panBy(pendingPanX / currentZoom, pendingPanY / currentZoom);

				// Update velocity for momentum (if we implement it later)
				const deltaTime = Math.max(now - lastPanTime, 1);
				velocityX = (pendingPanX / deltaTime) * 16; // Normalize to 60fps
				velocityY = (pendingPanY / deltaTime) * 16;

				logPanPerformance('Pan Update', {
					pendingX: pendingPanX,
					pendingY: pendingPanY,
					velocityX,
					velocityY,
					deltaTime
				});
			}

			pendingPanX = 0;
			pendingPanY = 0;
			lastPanTime = now;
			panUpdateFrame = null;
		});
	}

	// Apply momentum scrolling when panning stops
	function startMomentum() {
		if (momentumFrame || (Math.abs(velocityX) < 1 && Math.abs(velocityY) < 1)) return;

		function momentumStep() {
			velocityX *= VELOCITY_DAMPING;
			velocityY *= VELOCITY_DAMPING;

			if (Math.abs(velocityX) < 0.5 && Math.abs(velocityY) < 0.5) {
				momentumFrame = null;
				return;
			}

			const currentZoom = canvasStore.zoom;
			canvasStore.panBy(velocityX / currentZoom, velocityY / currentZoom);
			momentumFrame = requestAnimationFrame(momentumStep);
		}

		momentumFrame = requestAnimationFrame(momentumStep);
	}

	function stopMomentum() {
		if (momentumFrame) {
			cancelAnimationFrame(momentumFrame);
			momentumFrame = null;
		}
		velocityX = 0;
		velocityY = 0;
	}

	function handleMouseDown(event: MouseEvent) {
		// Trigger pan on middle click OR (left click AND (alt key OR spacebar)))
		const shouldPan =
			event.button === 1 || (event.button === 0 && (event.altKey || isSpacebarHeld));

		if (!shouldPan) return;

		stopMomentum(); // Stop any existing momentum
		isPanning = true;
		pauseAdapter();
		startX = event.clientX;
		startY = event.clientY;
		lastPanTime = performance.now();
		panStartTime = lastPanTime;
		panEventCount = 0;
		totalPanUpdates = 0;

		logPanPerformance('Pan Started', { x: startX, y: startY });

		node.style.cursor = 'grabbing';
		event.preventDefault();
		event.stopPropagation();

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isPanning) return;

		panEventCount++;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		// Accumulate movement for batched updates
		pendingPanX += dx;
		pendingPanY += dy;

		startX = event.clientX;
		startY = event.clientY;

		schedulePanUpdate();
	}

	function handleMouseUp(event: MouseEvent) {
		if (isPanning && (event.button === 0 || event.button === 1)) {
			const panDuration = performance.now() - panStartTime;
			logPanPerformance('Pan Ended', {
				duration: panDuration,
				events: panEventCount,
				updates: totalPanUpdates,
				avgEventsPerSecond: (panEventCount / panDuration) * 1000,
				avgUpdatesPerSecond: (totalPanUpdates / panDuration) * 1000
			});

			isPanning = false;
			debouncedResume();
			node.style.cursor = isSpacebarHeld ? 'grab' : 'default';

			// Clean up event listeners
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);

			// Final update and start momentum
			if (panUpdateFrame) {
				cancelAnimationFrame(panUpdateFrame);
				panUpdateFrame = null;
			}

			// Apply any remaining pending movement immediately
			if (Math.abs(pendingPanX) > 0.1 || Math.abs(pendingPanY) > 0.1) {
				const currentZoom = canvasStore.zoom;
				canvasStore.panBy(pendingPanX / currentZoom, pendingPanY / currentZoom);
				pendingPanX = 0;
				pendingPanY = 0;
			}

			// Start momentum if velocity is significant
			startMomentum();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			if (event.key === ' ') {
				return;
			}
		}

		if (event.key === ' ' && !isSpacebarHeld) {
			event.preventDefault();
			isSpacebarHeld = true;
			if (!isPanning) {
				node.style.cursor = 'grab';
			}
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key === ' ') {
			isSpacebarHeld = false;
			if (!isPanning) {
				node.style.cursor = 'default';
			}
		}
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length !== 1) return;

		stopMomentum(); // Stop any existing momentum
		const touch = event.touches[0];
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		isPanning = true;
		lastPanTime = performance.now();
		pauseAdapter();

		event.preventDefault();
	}

	function handleTouchMove(event: TouchEvent) {
		if (touchStartX === null || touchStartY === null || event.touches.length !== 1) return;

		const touch = event.touches[0];
		const dx = touch.clientX - touchStartX;
		const dy = touch.clientY - touchStartY;

		pendingPanX += dx;
		pendingPanY += dy;

		touchStartX = touch.clientX;
		touchStartY = touch.clientY;

		schedulePanUpdate();
	}

	function handleTouchEnd(event: TouchEvent) {
		if (event.touches.length === 0 && isPanning) {
			isPanning = false;
			debouncedResume();
			touchStartX = null;
			touchStartY = null;

			// Final update and start momentum
			if (panUpdateFrame) {
				cancelAnimationFrame(panUpdateFrame);
				panUpdateFrame = null;
			}

			// Apply any remaining pending movement immediately
			if (Math.abs(pendingPanX) > 0.1 || Math.abs(pendingPanY) > 0.1) {
				const currentZoom = canvasStore.zoom;
				canvasStore.panBy(pendingPanX / currentZoom, pendingPanY / currentZoom);
				pendingPanX = 0;
				pendingPanY = 0;
			}

			// Start momentum if velocity is significant
			startMomentum();
		}
	}

	// Initialize cursor
	node.style.cursor = 'default';

	// Add event listeners
	node.addEventListener('mousedown', handleMouseDown);
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);

	node.addEventListener('touchstart', handleTouchStart, { passive: false });
	node.addEventListener('touchmove', handleTouchMove, { passive: false });
	node.addEventListener('touchend', handleTouchEnd, { passive: false });
	node.addEventListener('touchcancel', handleTouchEnd, { passive: false });

	return {
		destroy() {
			// Clean up event listeners
			node.removeEventListener('mousedown', handleMouseDown);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);

			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', handleTouchEnd);
			node.removeEventListener('touchcancel', handleTouchEnd);

			// Clean up state
			node.style.cursor = '';

			// Cancel pending operations
			if (resumeTimeout) clearTimeout(resumeTimeout);
			if (panUpdateFrame) cancelAnimationFrame(panUpdateFrame);
			if (momentumFrame) cancelAnimationFrame(momentumFrame);

			// Ensure adapter is resumed
			if (isPaused) {
				canvasZeroAdapter.resume();
				isPaused = false;
			}
		}
	};
};
