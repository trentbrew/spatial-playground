import {
	FOCAL_PLANE_TARGET_SCALE,
	DOF_FOCUSED_SHARPNESS_FACTOR,
	DOF_EXPLORATION_SHARPNESS_FACTOR
} from '$lib/constants';

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
	// 0.77 gives roughly half the steepness compared to the previous 0.6 base (shallower depth).
	// For Z=0 (foreground), we add a minimum zoom to make interaction feel responsive
	const baseZoom = Math.pow(0.77, z);

	// For far-back nodes (negative z), increase minimum zoom to ensure clarity
	// The further back the node, the higher the minimum zoom
	let minZoom = 1.5; // Default minimum zoom

	if (z < 0) {
		// Use a gentler minimum zoom for back layers so they remain closer in perceived depth
		// This makes the overall Z-stack feel more compact.
		// Example with new formula: z=-1 → 2.5, z=-2 → 3.0, z=-3 → 3.5
		minZoom = 2.0 + Math.abs(z) * 0.25; // shallower increase per depth level
	}

	return Math.max(minZoom, baseZoom); // Use higher minimum zoom for better clarity
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
 * Uses a more gentle curve to prevent extreme parallax at deep depths.
 * @param z - The z-index of the layer.
 * @returns A parallax multiplier.
 */
export const getParallaxFactor = (z: number): number => {
	if (z === 0) return 1.0;

	// Use a gentler exponential curve to prevent extreme parallax
	// This creates a more natural depth feel without pushing nodes too far
	if (z < 0) {
		// Background layers: diminishing parallax as we go deeper
		// Formula: 1.0 - (1 - 0.84^|z|) gives us: Z-1≈0.84, Z-2≈0.71, Z-3≈0.60
		const factor = 1.0 - (1.0 - Math.pow(0.84, Math.abs(z)));
		return Math.max(0.5, factor); // Never go below 50% speed
	} else {
		// Foreground layers: gentler increase in parallax
		// Formula: 1.0 + 0.15 * z gives us: Z+1=1.15, Z+2=1.30, Z+3=1.45
		return 1.0 + 0.15 * z;
	}
};

/**
 * Determines if a node should be clickable based on its focus state.
 * Nodes that are significantly out of focus (high z-index foreground nodes)
 * should have pointer-events disabled so users can click through them.
 *
 * @param z - The z-index of the layer
 * @param zoom - The current global zoom level
 * @param isFocused - Whether any node is currently focused (for dynamic DOF)
 * @returns true if the node should be clickable, false if it should be click-through
 */
export const isNodeClickable = (z: number, zoom: number, isFocused: boolean = false): boolean => {
	// Background nodes (z < 0) are always clickable when visible
	if (z <= 0) return true;

	// Calculate the effective scale of this layer
	const intrinsicScale = getIntrinsicScaleFactor(z);
	const totalEffectiveScale = zoom * intrinsicScale;

	// Calculate how far this layer is from the ideal focal plane
	const focusDelta = Math.abs(FOCAL_PLANE_TARGET_SCALE - totalEffectiveScale);

	// Use dynamic depth of field based on focus state
	const dofSharpnessFactor = isFocused
		? DOF_FOCUSED_SHARPNESS_FACTOR
		: DOF_EXPLORATION_SHARPNESS_FACTOR;
	const maxBlur = isFocused ? 16 : 8;

	// Calculate blur amount using the same formula as the visual effects
	const blurAmount = Math.min(maxBlur, focusDelta * dofSharpnessFactor);

	// If the node is significantly blurred (more than 3px), make it non-clickable
	// This threshold can be adjusted based on UX preferences
	const BLUR_THRESHOLD = 5.0;

	return blurAmount <= BLUR_THRESHOLD;
};
