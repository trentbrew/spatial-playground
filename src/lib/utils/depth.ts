import { FOCAL_PLANE_TARGET_SCALE } from '$lib/constants';

/**
 * Calculates the zoom level at which a given z-plane is perfectly in focus.
 *
 * This is achieved with an exponential function: focusZoom(z) = (some_base)^z
 * The base is chosen to satisfy the desired focus behavior.
 *
 * @param z - The z-index of the layer.
 * @returns The zoom level for perfect focus.
 */
export const getFocusZoomForZ = (z: number): number => {
	// The base of the exponent determines how dramatically focus changes with Z.
	// 0.6 was chosen for a more dramatic effect.
	return Math.pow(0.6, z);
};

/**
 * Calculates an intrinsic scale factor for a layer based on its Z-position.
 * This determines its size relative to the base (z=0) plane and is crucial
 * for the depth-of-field focus effect.
 *
 * @param z - The z-index of the layer.
 * @returns A scale factor.
 */
export const getIntrinsicScaleFactor = (z: number): number => {
	const focusZoom = getFocusZoomForZ(z);

	// The intrinsic scale is the value that, when multiplied by the focusZoom,
	// equals the FOCAL_PLANE_CONSTANT.
	const scale = FOCAL_PLANE_TARGET_SCALE / focusZoom;

	// Clamp the scale to prevent extreme values.
	return Math.max(0.05, Math.min(scale, 10.0));
};

/**
 * Calculates a parallax factor for a layer to simulate depth.
 * Layers with z < 0 move slower than the base layer, and layers with z > 0 move faster.
 * @param z - The z-index of the layer.
 * @returns A parallax multiplier.
 */
export const getParallaxFactor = (z: number): number => {
	if (z === 0) return 1.0;
	// These values can be tweaked to change the "feel" of the parallax effect
	const parallaxScale = z < 0 ? 0.75 : 0.4;
	const factor = 1.0 + z * parallaxScale;
	return z < 0 ? Math.max(0.05, factor) : factor; // Prevent reversal for distant objects
};
