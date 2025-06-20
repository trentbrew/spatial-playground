/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
	screenX: number,
	screenY: number,
	zoom: number,
	offsetX: number,
	offsetY: number
): { x: number; y: number } {
	return {
		x: (screenX - offsetX) / zoom,
		y: (screenY - offsetY) / zoom
	};
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(
	worldX: number,
	worldY: number,
	zoom: number,
	offsetX: number,
	offsetY: number
): { x: number; y: number } {
	return {
		x: worldX * zoom + offsetX,
		y: worldY * zoom + offsetY
	};
}

/**
 * Get the center of the viewport in world coordinates
 */
export function getViewportCenterInWorld(
	viewportWidth: number,
	viewportHeight: number,
	zoom: number,
	offsetX: number,
	offsetY: number
): { x: number; y: number } {
	const centerScreenX = viewportWidth / 2;
	const centerScreenY = viewportHeight / 2;

	return screenToWorld(centerScreenX, centerScreenY, zoom, offsetX, offsetY);
}
