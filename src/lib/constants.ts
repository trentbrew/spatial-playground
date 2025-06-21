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

// Enhanced depth blur for very far back nodes (z <= -2)
export const DEPTH_BLUR_THRESHOLD = -2; // Z-level threshold for enhanced blur
export const DEPTH_BLUR_MULTIPLIER = 2.5; // Blur intensity multiplier for depth
export const DEPTH_BLUR_FACTOR = 3; // Factor for calculating depth blur
export const MAX_DEPTH_BLUR = 20; // Maximum blur amount in pixels
export const DEPTH_OPACITY_REDUCTION = 0.15; // Opacity reduction per z-level for far back nodes
export const MIN_DEPTH_OPACITY = 0.3; // Minimum opacity for far back nodes

// Default dimensions for different node types
export const DEFAULT_NODE_DIMENSIONS = {
	sticky: { width: 400, height: 400 },
	code: { width: 500, height: 300 },
	image: { width: 420, height: 200 },
	embed: { width: 800, height: 450 }, // 16:9 aspect ratio, twice as large
	note: { width: 400, height: 400 }
} as const;

export const MAX_NODE_WIDTH = 800; // Increased to accommodate larger embed nodes
export const MAX_NODE_HEIGHT = 450;
