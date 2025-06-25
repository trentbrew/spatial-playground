import { canvasStore } from '$lib/stores/canvasStore.svelte';
import type { Action } from 'svelte/action';
import { canvasZeroAdapter } from '$lib/stores/canvasZeroAdapter';
import { writable } from 'svelte/store';

// Global store indicating whether ANY box is currently being dragged
export const isDraggingStore = writable(false);

export const boxDragging: Action<HTMLElement, number> = (node, boxId) => {
	let startX = 0;
	let startY = 0;
	let initialBoxX = 0;
	let initialBoxY = 0;
	let isDragging = false;

	let viewportWidth = 0;
	let viewportHeight = 0;

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		if (canvasStore.fullscreenBoxId !== null) return;

		canvasZeroAdapter.pause();

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
		isDraggingStore.set(true);

		canvasStore.setDragging(boxId);

		node.setPointerCapture(event.pointerId);
		node.addEventListener('pointermove', handlePointerMove);
		node.addEventListener('pointerup', handlePointerUp);
		node.addEventListener('pointercancel', handlePointerUp);

		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerUp);
		window.addEventListener('blur', handlePointerUp);

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
		if (!isDragging) return;

		isDragging = false;
		isDraggingStore.set(false);
		canvasStore.setDragging(null);
		canvasZeroAdapter.resume();

		if (viewportWidth > 0 && viewportHeight > 0) {
			canvasStore.onViewChange(viewportWidth, viewportHeight);
		}

		node.releasePointerCapture(event.pointerId);
		node.removeEventListener('pointermove', handlePointerMove);
		node.removeEventListener('pointerup', handlePointerUp);
		node.removeEventListener('pointercancel', handlePointerUp);
		window.removeEventListener('pointerup', handlePointerUp);
		window.removeEventListener('pointercancel', handlePointerUp);
		window.removeEventListener('blur', handlePointerUp);
	}

	node.addEventListener('pointerdown', handlePointerDown);

	return {
		destroy() {
			node.removeEventListener('pointerdown', handlePointerDown);
			if (isDragging && canvasStore.draggingBoxId === boxId) {
				canvasStore.setDragging(null);
			}
			isDraggingStore.set(false);
		}
	};
};

// Attach store for external modules (e.g., CustomCursor)
(boxDragging as any).isDragging = isDraggingStore;
