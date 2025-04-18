import type { Action } from 'svelte/action';
import { canvasStore } from '$lib/stores/canvasStore';
import { get } from 'svelte/store';

// Constants
const ZOOM_SPEED_FACTOR = 0.005;

export const zooming: Action<HTMLElement, { preventDefault?: boolean } | undefined> = (
	node,
	params
) => {
	const preventDefault = params?.preventDefault ?? true;

	function handleWheel(event: WheelEvent) {
		// Disable zooming if a box is fullscreen
		const currentFullscreenId = get(canvasStore).fullscreenBoxId;
		if (get(canvasStore).fullscreenBoxId !== null) {
			return;
		}

		if (preventDefault) {
			event.preventDefault();
		}

		const isZoomGesture = event.ctrlKey || event.metaKey;

		if (isZoomGesture) {
			// --- Zoom Logic (Ctrl/Meta + Scroll) ---
			const rect = node.getBoundingClientRect();
			const mouseX = event.clientX - rect.left;
			const mouseY = event.clientY - rect.top;

			let currentZoom: number;
			let currentOffsetX: number;
			let currentOffsetY: number;
			const unsub = canvasStore.subscribe((state) => {
				currentZoom = state.zoom;
				currentOffsetX = state.offsetX;
				currentOffsetY = state.offsetY;
			});
			unsub();

			const worldX = (mouseX - currentOffsetX!) / currentZoom!;
			const worldY = (mouseY - currentOffsetY!) / currentZoom!;

			const zoomFactor = 1.1;
			const newZoom = Math.max(
				0.1,
				Math.min(currentZoom! * (event.deltaY < 0 ? zoomFactor : 1 / zoomFactor), 10)
			);

			const newOffsetX = mouseX - worldX * newZoom;
			const newOffsetY = mouseY - worldY * newZoom;

			canvasStore.setTargetViewport({ zoom: newZoom, x: newOffsetX, y: newOffsetY });
		} else {
			// --- Pan Logic (Standard Scroll/Trackpad Swipe) ---
			canvasStore.panBy(-event.deltaX, -event.deltaY);
		}
	}

	node.addEventListener('wheel', handleWheel, { passive: false });
	return {
		destroy() {
			node.removeEventListener('wheel', handleWheel);
		}
	};
};
