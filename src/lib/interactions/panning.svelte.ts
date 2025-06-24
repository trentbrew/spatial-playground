import type { Action } from 'svelte/action';
import { offsetX, offsetY } from '$lib/stores/viewportStore';
import { get } from 'svelte/store';

export const panning: Action<HTMLElement> = (node) => {
	let isPanning = false;
	let isSpacebarHeld = false;
	let startX = 0;
	let startY = 0;

	// Touch handling state
	let touchStartX: number | null = null;
	let touchStartY: number | null = null;

	// Performance optimization: throttle pan updates
	let panUpdateFrame: number | null = null;
	let pendingPanX = 0;
	let pendingPanY = 0;

	function flushPanUpdate() {
		if (panUpdateFrame) {
			cancelAnimationFrame(panUpdateFrame);
		}
		panUpdateFrame = requestAnimationFrame(() => {
			offsetX.update((x) => x + pendingPanX);
			offsetY.update((y) => y + pendingPanY);
			pendingPanX = 0;
			pendingPanY = 0;
			panUpdateFrame = null;
		});
	}

	function handleMouseDown(event: MouseEvent) {
		// Disable panning if a box is fullscreen
		// (Optional: add fullscreen check if needed)

		// Trigger pan on middle click OR (left click AND (alt key OR spacebar)))
		const shouldPan =
			event.button === 1 || (event.button === 0 && (event.altKey || isSpacebarHeld));

		if (!shouldPan) return;

		isPanning = true;
		startX = event.clientX;
		startY = event.clientY;
		node.style.cursor = 'grabbing';
		event.preventDefault();
		event.stopPropagation();

		// Add move/up listeners globally only when panning starts
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isPanning) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		startX = event.clientX;
		startY = event.clientY;
		pendingPanX += dx;
		pendingPanY += dy;
		flushPanUpdate(); // Call during move for real-time updates
	}

	function handleMouseUp(event: MouseEvent) {
		// Only react to the button that started the pan if it was button 0 or 1
		if (isPanning && (event.button === 0 || event.button === 1)) {
			isPanning = false;
			// Set cursor back based on spacebar state
			node.style.cursor = isSpacebarHeld ? 'grab' : 'default';
			// Remove global listeners
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			flushPanUpdate();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Allow spacebar in inputs/textareas/contenteditables
		const target = event.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			if (event.key === ' ') {
				// Don't prevent default spacebar action for inputs/textareas
				return;
			}
			// Allow other keys in inputs as well
			// return; // Potentially return here too if NO keys should trigger pan while input focused
		}

		if (event.key === ' ' && !isSpacebarHeld) {
			// Prevent page scroll
			event.preventDefault();
			isSpacebarHeld = true;
			// Change cursor only if not already panning
			if (!isPanning) {
				node.style.cursor = 'grab';
			}
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.key === ' ') {
			isSpacebarHeld = false;
			// Change cursor only if not currently panning
			if (!isPanning) {
				node.style.cursor = 'default';
			}
		}
	}

	// --- Touch Event Handlers ---

	function handleTouchStart(event: TouchEvent) {
		// Only handle single touch for panning for now
		if (event.touches.length !== 1) return;
		// Disable panning if a box is fullscreen
		// (Optional: add fullscreen check if needed)

		const touch = event.touches[0];
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		isPanning = true; // Use the same flag for simplicity

		// Prevent default scrolling/zooming behavior that might start on touch
		// Note: This might prevent desired pinch-zoom if not handled elsewhere.
		// Let's keep it specific to move for now.
		event.preventDefault(); // Try preventing default right at the start
	}

	function handleTouchMove(event: TouchEvent) {
		if (touchStartX === null || touchStartY === null) return;

		const touch = event.touches[0];
		const dx = touch.clientX - touchStartX;
		const dy = touch.clientY - touchStartY;

		// Pan the canvas
		pendingPanX += dx;
		pendingPanY += dy;
		flushPanUpdate(); // Call during move for real-time updates

		// Update start coordinates for the next move event
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
	}

	function handleTouchEnd(event: TouchEvent) {
		// Reset panning state if the last touch has ended
		if (event.touches.length === 0 && isPanning) {
			isPanning = false;
			touchStartX = null;
			touchStartY = null;
			flushPanUpdate();
		}
	}

	// Initial cursor based on Spacebar state (though unlikely to be held on mount)
	node.style.cursor = 'default';

	// Add listeners
	node.addEventListener('mousedown', handleMouseDown);
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);
	// Mouse move/up listeners are added dynamically in handleMouseDown

	// Add touch listeners
	node.addEventListener('touchstart', handleTouchStart, { passive: false });
	node.addEventListener('touchmove', handleTouchMove, { passive: false });
	node.addEventListener('touchend', handleTouchEnd, { passive: false });
	node.addEventListener('touchcancel', handleTouchEnd, { passive: false }); // Handle cancellations too

	return {
		destroy() {
			node.removeEventListener('mousedown', handleMouseDown);
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			// Ensure dynamic listeners are removed if component is destroyed mid-pan
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);

			// Remove touch listeners
			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', handleTouchEnd);
			node.removeEventListener('touchcancel', handleTouchEnd);

			node.style.cursor = ''; // Reset cursor
		}
	};
};
