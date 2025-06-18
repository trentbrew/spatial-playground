export const FOCUS_TRANSITION_DURATION = 250; // ms

// The "ideal" effective scale for a layer to be perfectly in focus.
// A value > 1.0 pulls the default focal plane forward, "closer" to the camera.
export const FOCAL_PLANE_TARGET_SCALE = 1.2;

// Determines how quickly blur and other depth effects are applied as a layer moves away from the focal plane.
// A higher number creates a more dramatic, "shallower" depth of field.
export const DOF_SHARPNESS_FACTOR = 15;
