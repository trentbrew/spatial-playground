import { canvasStore } from '$lib/stores/canvasStore.svelte';
import type { Action } from 'svelte/action';

export const boxDragging: Action<HTMLElement, number> = (node, boxId) => {
	let startX = 0;
	let startY = 0;
	let initialBoxX = 0;
	let initialBoxY = 0;
	let isDragging = false;

	// We need the viewport dimensions to pass to selectBox
	let viewportWidth = 0;
	let viewportHeight = 0;

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		if (canvasStore.fullscreenBoxId !== null) return;

		const viewportEl = node.closest('.viewport');
		if (viewportEl) {
			viewportWidth = viewportEl.clientWidth;
			viewportHeight = viewportEl.clientHeight;
		}

		canvasStore.selectBox(boxId, viewportWidth, viewportHeight);

		const box = canvasStore.boxes.find((b) => b.id === boxId);
		if (!box) return;

		initialBoxX = box.x;
		initialBoxY = box.y;
		startX = event.clientX;
		startY = event.clientY;
		isDragging = true;

		// Set dragging state to suspend parallax for this node
		canvasStore.setDragging(boxId);

		node.setPointerCapture(event.pointerId);
		node.addEventListener('pointermove', handlePointerMove);
		node.addEventListener('pointerup', handlePointerUp);
		node.addEventListener('pointercancel', handlePointerUp); // Handle pointer cancel

		// Also listen for these events on window to catch edge cases
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerUp);
		window.addEventListener('blur', handlePointerUp); // Clear on window blur

		event.stopPropagation();
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isDragging) return;

		const dx = (event.clientX - startX) / canvasStore.zoom;
		const dy = (event.clientY - startY) / canvasStore.zoom;

		canvasStore.updateBox(boxId, { x: initialBoxX + dx, y: initialBoxY + dy });
	}

	function handlePointerUp(event: PointerEvent) {
		if (!isDragging) return; // Guard against multiple calls

		isDragging = false;

		// Clear dragging state to restore parallax
		canvasStore.setDragging(null);

		// Refresh ghosting after dragging ends, since box position changed
		if (viewportWidth > 0 && viewportHeight > 0) {
			canvasStore.onViewChange(viewportWidth, viewportHeight);
		}

		node.releasePointerCapture(event.pointerId);
		node.removeEventListener('pointermove', handlePointerMove);
		node.removeEventListener('pointerup', handlePointerUp);
		node.removeEventListener('pointercancel', handlePointerUp);

		// Remove window listeners
		window.removeEventListener('pointerup', handlePointerUp);
		window.removeEventListener('pointercancel', handlePointerUp);
		window.removeEventListener('blur', handlePointerUp);
	}

	node.addEventListener('pointerdown', handlePointerDown);

	return {
		destroy() {
			node.removeEventListener('pointerdown', handlePointerDown);

			// Safety cleanup: clear dragging state if this box was being dragged
			if (isDragging && canvasStore.draggingBoxId === boxId) {
				canvasStore.setDragging(null);
			}
		}
	};
};
