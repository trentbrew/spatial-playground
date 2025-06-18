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

		node.setPointerCapture(event.pointerId);
		node.addEventListener('pointermove', handlePointerMove);
		node.addEventListener('pointerup', handlePointerUp);

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
		isDragging = false;
		node.releasePointerCapture(event.pointerId);
		node.removeEventListener('pointermove', handlePointerMove);
		node.removeEventListener('pointerup', handlePointerUp);
	}

	node.addEventListener('pointerdown', handlePointerDown);

	return {
		destroy() {
			node.removeEventListener('pointerdown', handlePointerDown);
		}
	};
};
