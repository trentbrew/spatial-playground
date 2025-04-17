export interface BoxState {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	content: string;
	color: string;
}

// Define the extended type here
export type AppBoxState = BoxState & { type: string };

export interface GraphState {
	zoom: number;
	offsetX: number;
	offsetY: number;
	boxes: BoxState[];
	// Add other state aspects later, e.g., cursors, selections
}

/**
 * Creates a serializable snapshot of the current canvas state.
 */
export function serializeCanvasState(
	zoom: number,
	offsetX: number,
	offsetY: number,
	boxes: BoxState[]
): GraphState {
	// Return a deep copy to avoid external mutations affecting internal state
	return {
		zoom: zoom,
		offsetX: offsetX,
		offsetY: offsetY,
		boxes: JSON.parse(JSON.stringify(boxes))
	};
}

/**
 * Prepares the necessary state updates to load a graph state.
 * Returns an object with state values that the Svelte component can apply.
 */
export function prepareStateForLoad(state: GraphState): {
	targetZoom: number;
	targetOffsetX: number;
	targetOffsetY: number;
	newBoxes: AppBoxState[];
} {
	// Use deep copy if the incoming state object might be reused/mutated elsewhere
	const loadedBoxes = JSON.parse(JSON.stringify(state.boxes));

	// Ensure loaded boxes have a type (add default if missing)
	const newBoxes: AppBoxState[] = loadedBoxes.map((box: any) => ({
		...box,
		type: box.type || 'sticky' // Default to sticky if type is missing
	}));

	return {
		targetZoom: state.zoom,
		targetOffsetX: state.offsetX,
		targetOffsetY: state.offsetY,
		newBoxes: newBoxes
	};
}
