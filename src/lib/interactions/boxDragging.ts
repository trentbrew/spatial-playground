import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore';
import { get } from 'svelte/store';

export const boxDragging: Action<HTMLElement, number> = (node, boxId) => {
	let isDown = false;
	let startX = 0;
	let startY = 0;
	let initialX = 0;
	let initialY = 0;
	let currentZoom = 1;

	// Subscribe to zoom level only
	const unsubZoom = canvasStore.subscribe((state) => {
		currentZoom = state.zoom;
	});

	function handleMouseDown(event: MouseEvent) {
		if (event.button !== 0) return;
		// Disable dragging if this box is fullscreen
		const currentFullscreenId = get(canvasStore).fullscreenBoxId;
		if (get(canvasStore).fullscreenBoxId === boxId) {
			return;
		}

		// Select the box immediately on mousedown
		canvasStore.selectBox(boxId);

		isDown = true;
		startX = event.clientX;
		startY = event.clientY;

		// Capture initial box position
		const unsubPos = canvasStore.subscribe((state) => {
			const box = state.boxes.find((b) => b.id === boxId);
			if (box) {
				initialX = box.x;
				initialY = box.y;
			}
		});
		unsubPos();

		// Listen for move/up on the whole document
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		event.preventDefault();
		event.stopPropagation();
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length !== 1) return;
		// Disable dragging if this box is fullscreen
		const currentFullscreenIdTouch = get(canvasStore).fullscreenBoxId;
		if (get(canvasStore).fullscreenBoxId === boxId) {
			return;
		}

		// Select the box immediately on touchstart
		canvasStore.selectBox(boxId);

		isDown = true;
		startX = event.touches[0].clientX;
		startY = event.touches[0].clientY;

		// Capture initial box position
		const unsubPos = canvasStore.subscribe((state) => {
			const box = state.boxes.find((b) => b.id === boxId);
			if (box) {
				initialX = box.x;
				initialY = box.y;
			}
		});
		unsubPos();

		// Listen for move/up on the whole document
		document.addEventListener('touchmove', handleTouchMove, { passive: false });
		document.addEventListener('touchend', handleTouchEnd, { passive: false });

		event.preventDefault();
		event.stopPropagation();
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDown) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		const worldDX = dx / currentZoom;
		const worldDY = dy / currentZoom;
		canvasStore.updateBox(boxId, { x: initialX + worldDX, y: initialY + worldDY });
	}

	function handleMouseUp() {
		if (!isDown) return;
		isDown = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isDown) return;
		const dx = event.touches[0].clientX - startX;
		const dy = event.touches[0].clientY - startY;
		const worldDX = dx / currentZoom;
		const worldDY = dy / currentZoom;
		canvasStore.updateBox(boxId, { x: initialX + worldDX, y: initialY + worldDY });
	}

	function handleTouchEnd() {
		if (!isDown) return;
		isDown = false;
		document.removeEventListener('touchmove', handleTouchMove);
		document.removeEventListener('touchend', handleTouchEnd);
	}

	node.addEventListener('mousedown', handleMouseDown);
	node.addEventListener('touchstart', handleTouchStart, { passive: false });

	return {
		destroy() {
			node.removeEventListener('mousedown', handleMouseDown);
			node.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('touchmove', handleTouchMove);
			document.removeEventListener('touchend', handleTouchEnd);
			unsubZoom();
		}
	};
};
