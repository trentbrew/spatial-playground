import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore.svelte';

// Minimum dimensions for a box
const MIN_WIDTH = 360;
const MIN_HEIGHT = 270;

export const boxResizing: Action<HTMLElement, number> = (node, boxId) => {
	let isResizing = false;
	let startX = 0;
	let startY = 0;
	let initialX = 0;
	let initialY = 0;
	let initialWidth = 0;
	let initialHeight = 0;

	let handleType = ''; // Store handle type being dragged

	// Track viewport dimensions for ghosting refresh
	let viewportWidth = 0;
	let viewportHeight = 0;

	function handleMouseDown(event: MouseEvent) {
		if (event.button !== 0) return;
		handleType = (node.dataset.handleType || '').toLowerCase();
		if (!handleType) return; // Ensure handle type is set

		isResizing = true;
		startX = event.clientX;
		startY = event.clientY;

		// Get viewport dimensions for ghosting refresh
		const viewportEl = node.closest('.viewport');
		if (viewportEl) {
			viewportWidth = viewportEl.clientWidth;
			viewportHeight = viewportEl.clientHeight;
		}

		// Get initial box dimensions
		const box = canvasStore.boxes.find((b) => b.id === boxId);
		if (box) {
			initialX = box.x;
			initialY = box.y;
			initialWidth = box.width;
			initialHeight = box.height;
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('mouseup', handlePointerUp);
		window.addEventListener('touchend', handlePointerUp);
		event.preventDefault();
		event.stopPropagation();
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length !== 1) return;
		handleType = (node.dataset.handleType || '').toLowerCase();
		if (!handleType) return;

		isResizing = true;
		startX = event.touches[0].clientX;
		startY = event.touches[0].clientY;

		// Get viewport dimensions for ghosting refresh
		const viewportEl = node.closest('.viewport');
		if (viewportEl) {
			viewportWidth = viewportEl.clientWidth;
			viewportHeight = viewportEl.clientHeight;
		}

		// Get initial box dimensions
		const box = canvasStore.boxes.find((b) => b.id === boxId);
		if (box) {
			initialX = box.x;
			initialY = box.y;
			initialWidth = box.width;
			initialHeight = box.height;
		}

		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handlePointerUp, { passive: false });
		event.preventDefault();
		event.stopPropagation();
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isResizing) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		updateDimensions(dx, dy);
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isResizing || !event.touches[0]) return;
		event.preventDefault();
		const dx = event.touches[0].clientX - startX;
		const dy = event.touches[0].clientY - startY;
		updateDimensions(dx, dy);
	}

	function updateDimensions(dx: number, dy: number) {
		const worldDX = dx / canvasStore.zoom;
		const worldDY = dy / canvasStore.zoom;

		let newX = initialX;
		let newY = initialY;
		let newWidth = initialWidth;
		let newHeight = initialHeight;

		// Adjust dimensions based on handle type
		if (handleType.includes('e')) {
			newWidth = Math.max(MIN_WIDTH, initialWidth + worldDX);
		}
		if (handleType.includes('w')) {
			newWidth = Math.max(MIN_WIDTH, initialWidth - worldDX);
			newX = initialX + worldDX;
		}
		if (handleType.includes('s')) {
			newHeight = Math.max(MIN_HEIGHT, initialHeight + worldDY);
		}
		if (handleType.includes('n')) {
			newHeight = Math.max(MIN_HEIGHT, initialHeight - worldDY);
			newY = initialY + worldDY;
		}

		// Check width change for top/bottom handles if aspect ratio needed later
		// Check height change for left/right handles if aspect ratio needed later

		// Prevent negative dimensions during drag adjustments for opposite handles
		if (handleType.includes('w')) {
			if (newWidth < MIN_WIDTH) {
				newX = initialX + (initialWidth - MIN_WIDTH);
				newWidth = MIN_WIDTH;
			}
		}
		if (handleType.includes('n')) {
			if (newHeight < MIN_HEIGHT) {
				newY = initialY + (initialHeight - MIN_HEIGHT);
				newHeight = MIN_HEIGHT;
			}
		}

		canvasStore.updateBox(boxId, {
			x: newX,
			y: newY,
			width: newWidth,
			height: newHeight
		});
	}

	function handlePointerUp(event: MouseEvent | TouchEvent) {
		if (!isResizing) return;
		isResizing = false;

		// Stop the event from bubbling up and causing a click on the viewport
		event.stopPropagation();

		// Refresh ghosting after resizing ends, since box size changed
		if (viewportWidth > 0 && viewportHeight > 0) {
			canvasStore.onViewChange(viewportWidth, viewportHeight);
		}

		// Explicitly re-focus the box after resizing to prevent accidental unfocus
		setTimeout(() => {
			canvasStore.zoomToBox(boxId, viewportWidth, viewportHeight);
		}, 10);

		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('touchmove', handleTouchMove);
		window.removeEventListener('mouseup', handlePointerUp);
		window.removeEventListener('touchend', handlePointerUp);
	}

	node.addEventListener('mousedown', handleMouseDown);
	node.addEventListener('touchstart', handleTouchStart, { passive: false });

	return {
		destroy() {
			node.removeEventListener('mousedown', handleMouseDown);
			node.removeEventListener('touchstart', handleTouchStart);
			// Ensure global listeners are removed if destroyed mid-resize
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('touchmove', handleTouchMove);
			window.removeEventListener('mouseup', handlePointerUp);
			window.removeEventListener('touchend', handlePointerUp);
		}
	};
};
