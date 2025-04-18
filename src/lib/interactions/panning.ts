import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore';
import { get } from 'svelte/store';

export const panning: Action<HTMLElement> = (node) => {
	let isPanning = false;
	let isSpacebarHeld = false;
	let startX = 0;
	let startY = 0;

	// Touch handling state
	let touchStartX: number | null = null;
	let touchStartY: number | null = null;

	function handleMouseDown(event: MouseEvent) {
		// Disable panning if a box is fullscreen
		const currentFullscreenId = get(canvasStore).fullscreenBoxId;
		if (currentFullscreenId !== null) {
			return;
		}

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
		canvasStore.panBy(dx, dy);
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
		const currentFullscreenIdTouch = get(canvasStore).fullscreenBoxId;
		if (currentFullscreenIdTouch !== null) {
			return;
		}

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
		if (!isPanning || touchStartX === null || touchStartY === null || event.touches.length !== 1) {
			return;
		}

		const touch = event.touches[0];
		const currentX = touch.clientX;
		const currentY = touch.clientY;

		const dx = currentX - touchStartX;
		const dy = currentY - touchStartY;

		// Check if swipe is mostly horizontal (like user example)
		if (Math.abs(dx) > Math.abs(dy)) {
			// If horizontal swipe detected, prevent default browser action (swipe back/forward)
			event.preventDefault();
		}

		// Pan the canvas
		canvasStore.panBy(dx, dy);

		// Update start coordinates for the next move event
		touchStartX = currentX;
		touchStartY = currentY;
	}

	function handleTouchEnd(event: TouchEvent) {
		// Reset panning state if the last touch has ended
		if (event.touches.length === 0 && isPanning) {
			isPanning = false;
			touchStartX = null;
			touchStartY = null;
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
