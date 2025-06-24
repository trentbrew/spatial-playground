import { scaleLog } from 'd3-scale';

/**
 * Defines the valid range for z-indices.
 */
export const Z_INDEX_RANGE: [number, number] = [-10, 0];

/**
 * Defines the valid range for zoom levels.
 */
export const ZOOM_RANGE: [number, number] = [0.1, 10];

/**
 * A logarithmic scale to map zoom levels to z-indices.
 * Zooming is often perceived logarithmically, while z-index is linear.
 * - A lower zoom (zoomed out) maps to a higher z-index (closer to 0).
 * - A higher zoom (zoomed in) maps to a lower z-index (closer to -10).
 */
const zoomToZScale = scaleLog()
	.domain(ZOOM_RANGE)
	.range([Z_INDEX_RANGE[1], Z_INDEX_RANGE[0]]) // Flipped range for inverse mapping
	.clamp(true);

/**
 * Maps a zoom level to its corresponding z-index.
 *
 * @param zoom The current zoom level.
 * @returns The calculated integer z-index.
 */
export function mapZoomToZ(zoom: number): number {
	return Math.round(zoomToZScale(zoom));
}
