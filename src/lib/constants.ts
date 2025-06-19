export const FOCUS_TRANSITION_DURATION = 250; // ms

// The "ideal" effective scale for a layer to be perfectly in focus.
// A value > 1.0 pulls the default focal plane forward, "closer" to the camera.
export const FOCAL_PLANE_TARGET_SCALE = 1.2;

// Determines how quickly blur and other depth effects are applied as a layer moves away from the focal plane.
// A higher number creates a more dramatic, "shallower" depth of field.
// A lower number creates a wider, more forgiving depth of field for better exploration.
export const DOF_SHARPNESS_FACTOR = 5;

// Dynamic depth of field - much more dramatic when a node is focused
export const DOF_FOCUSED_SHARPNESS_FACTOR = 4; // Shallow depth when focused
export const DOF_EXPLORATION_SHARPNESS_FACTOR = 5; // Wide depth for exploration

// Default dimensions for different node types
export const DEFAULT_NODE_DIMENSIONS = {
	sticky: { width: 400, height: 400 },
	code: { width: 500, height: 300 },
	image: { width: 420, height: 200 },
	embed: { width: 400, height: 400 },
	note: { width: 400, height: 400 }
} as const;

export const MAX_NODE_WIDTH = 400;
export const MAX_NODE_HEIGHT = 400;
