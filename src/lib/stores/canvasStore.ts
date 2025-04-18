import { writable, get } from 'svelte/store';
import type { AppBoxState } from '$lib/canvasState';

// --- Constants ---
const ZOOM_PADDING_FACTOR = 0.5; // Zoom to 50% of viewport size

// Define the shape of the canvas store state
interface CanvasStoreState {
	zoom: number;
	offsetX: number;
	offsetY: number;
	targetZoom: number;
	targetOffsetX: number;
	targetOffsetY: number;
	// Zoom-to-box state
	isAnimatingDoublezoom: boolean;
	zoomedBoxId: number | null;
	prevZoom: number;
	prevOffsetX: number;
	prevOffsetY: number;
	// Fullscreen state
	fullscreenBoxId: number | null;
	originalBoxState: Omit<AppBoxState, 'content' | 'color' | 'type'> | null;
	originalViewZoom: number;
	originalViewOffsetX: number;
	originalViewOffsetY: number;

	// Animation state
	isAnimatingFullscreen: boolean;
	fullscreenTransitionStartTime: number | null;
	transitionSourceZoom: number;
	transitionSourceOffsetX: number;
	transitionSourceOffsetY: number;

	boxes: AppBoxState[];
	selectedBoxId: number | null;
	lastSelectedBoxId: number | null; // To keep track of the most recently selected box for z-indexing
}

function createCanvasStore() {
	// Initial core state
	const initialState: CanvasStoreState = {
		zoom: 1,
		offsetX: 0,
		offsetY: 0,
		targetZoom: 1,
		targetOffsetX: 0,
		targetOffsetY: 0,
		isAnimatingDoublezoom: false,
		zoomedBoxId: null,
		prevZoom: 1,
		prevOffsetX: 0,
		prevOffsetY: 0,
		fullscreenBoxId: null,
		originalBoxState: null,
		originalViewZoom: 1,
		originalViewOffsetX: 0,
		originalViewOffsetY: 0,
		isAnimatingFullscreen: false,
		fullscreenTransitionStartTime: null,
		transitionSourceZoom: 1,
		transitionSourceOffsetX: 0,
		transitionSourceOffsetY: 0,
		boxes: [
			{
				id: 1,
				x: 100,
				y: 100,
				width: 200,
				height: 200,
				color: 'lightblue',
				content: 'Box 1',
				type: 'sticky'
			},
			{
				id: 2,
				x: 400,
				y: 250,
				width: 200,
				height: 200,
				color: 'lightcoral',
				content: 'Box 2',
				type: 'sticky'
			},
			{
				id: 3,
				x: -150,
				y: 400,
				width: 250,
				height: 200,
				color: 'lightgoldenrodyellow',
				content: 'Box 3',
				type: 'sticky'
			},
			{
				id: 4,
				x: 350,
				y: -100,
				width: 200,
				height: 300,
				color: 'lightseagreen',
				content: 'Box 4',
				type: 'sticky'
			}
		],
		selectedBoxId: null,
		lastSelectedBoxId: null
	};

	const { subscribe, update } = writable<CanvasStoreState>(initialState);

	return {
		subscribe,

		// Pan the view by a delta (updates current state directly for responsiveness)
		panBy: (dx: number, dy: number) => {
			update((state) => {
				const newOffsetX = state.offsetX + dx;
				const newOffsetY = state.offsetY + dy;
				// Also update target to prevent animation fighting drag
				return {
					...state,
					offsetX: newOffsetX,
					offsetY: newOffsetY,
					targetOffsetX: newOffsetX,
					targetOffsetY: newOffsetY
				};
			});
		},

		// Set the target viewport state (used by zooming action)
		setTargetViewport: (target: { zoom: number; x: number; y: number }) => {
			update((state) => ({
				...state,
				targetZoom: target.zoom,
				targetOffsetX: target.x,
				targetOffsetY: target.y
			}));
		},

		// Set the actual viewport state (used by animation loop)
		_setViewport: (viewport: { zoom: number; x: number; y: number }) => {
			update((state) => ({
				...state,
				zoom: viewport.zoom,
				offsetX: viewport.x,
				offsetY: viewport.y
			}));
		},

		// Add a new box to the canvas
		addBox: (box: AppBoxState) => update((state) => ({ ...state, boxes: [...state.boxes, box] })),

		// Update an existing box by partial properties
		updateBox: (id: number, partial: Partial<AppBoxState>) =>
			update((state) => {
				const newBoxes = state.boxes.map((box) => {
					if (box.id === id) {
						const updatedBox = { ...box, ...partial };
						// Enforce minimum dimensions here as well
						if (updatedBox.width !== undefined) {
							updatedBox.width = Math.max(200, updatedBox.width);
						}
						if (updatedBox.height !== undefined) {
							updatedBox.height = Math.max(200, updatedBox.height);
						}
						return updatedBox;
					}
					return box;
				});
				return { ...state, boxes: newBoxes };
			}),

		// Select a box by ID (or clear selection with null)
		selectBox: (id: number | null) =>
			update((state) => {
				if (id !== null) {
					// If selecting a box, update both selected and lastSelected
					return { ...state, selectedBoxId: id, lastSelectedBoxId: id };
				} else {
					// If deselecting, only clear selectedId, keep lastSelectedId
					return { ...state, selectedBoxId: null };
				}
			}),

		// Enter fullscreen for a box
		enterFullscreen: (boxId: number, viewportWidth: number, viewportHeight: number) => {
			update((state) => {
				const boxIndex = state.boxes.findIndex((b) => b.id === boxId);
				if (boxIndex === -1) return state;

				// Store original view state only if not already fullscreen
				let { originalViewZoom, originalViewOffsetX, originalViewOffsetY } = state;
				if (state.fullscreenBoxId === null) {
					originalViewZoom = state.zoom;
					originalViewOffsetX = state.offsetX;
					originalViewOffsetY = state.offsetY;
				}

				// Store original box state
				const boxToStore =
					state.fullscreenBoxId !== null && state.originalBoxState
						? state.originalBoxState
						: state.boxes[boxIndex];
				const originalBoxState = {
					id: boxToStore.id,
					x: boxToStore.x,
					y: boxToStore.y,
					width: boxToStore.width,
					height: boxToStore.height
				};

				// Update box state immediately
				const newBoxes = [...state.boxes];
				newBoxes[boxIndex] = {
					...newBoxes[boxIndex],
					x: 0,
					y: 0,
					width: viewportWidth,
					height: viewportHeight
				};

				// Store source view for transition
				const sourceZoom = state.zoom;
				const sourceOffsetX = state.offsetX;
				const sourceOffsetY = state.offsetY;

				return {
					...state,
					boxes: newBoxes,
					isAnimatingFullscreen: true,
					fullscreenTransitionStartTime: performance.now(),
					transitionSourceZoom: sourceZoom,
					transitionSourceOffsetX: sourceOffsetX,
					transitionSourceOffsetY: sourceOffsetY,
					fullscreenBoxId: boxId,
					originalBoxState: originalBoxState,
					originalViewZoom: originalViewZoom,
					originalViewOffsetX: originalViewOffsetX,
					originalViewOffsetY: originalViewOffsetY,
					// Set target view for fullscreen animation
					targetZoom: 1,
					targetOffsetX: 0,
					targetOffsetY: 0,
					// Clear zoom-to-box state
					zoomedBoxId: null,
					isAnimatingDoublezoom: false
				};
			});
		},

		// Initiate the exit fullscreen animation
		exitFullscreen: () => {
			console.log('[canvasStore] exitFullscreen called');
			update((state) => {
				if (state.fullscreenBoxId === null || !state.originalBoxState) {
					console.warn('[canvasStore] exitFullscreen called but no fullscreen box or state found.');
					return state;
				}
				// Restore box state IMMEDIATELY (like legacy)
				const boxIndex = state.boxes.findIndex((b) => b.id === state.fullscreenBoxId);
				if (boxIndex === -1) {
					console.error(
						'[canvasStore] exitFullscreen: Cannot find box index for ID:',
						state.fullscreenBoxId
					);
					return state; // Should not happen
				}
				const newBoxes = [...state.boxes];
				newBoxes[boxIndex] = { ...newBoxes[boxIndex], ...state.originalBoxState };

				// Store source view for transition
				const sourceZoom = state.zoom;
				const sourceOffsetX = state.offsetX;
				const sourceOffsetY = state.offsetY;

				return {
					...state,
					boxes: newBoxes, // Apply the restored box state
					isAnimatingFullscreen: true, // Ensure animation flag is set
					fullscreenTransitionStartTime: performance.now(),
					transitionSourceZoom: sourceZoom,
					transitionSourceOffsetX: sourceOffsetX,
					transitionSourceOffsetY: sourceOffsetY,
					// Set target back to original view
					targetZoom: state.originalViewZoom,
					targetOffsetX: state.originalViewOffsetX,
					targetOffsetY: state.originalViewOffsetY,
					// Don't clear fullscreen state here yet
					// Don't trigger doublezoom animation on exit
					isAnimatingDoublezoom: false
				};
			});
		},

		// Internal method to finalize state after exit animation completes
		_finalizeExitFullscreen: () => {
			console.log('[canvasStore] _finalizeExitFullscreen called');
			update((state) => {
				if (state.fullscreenBoxId === null) {
					console.warn('[canvasStore] _finalizeExitFullscreen called but no fullscreen box found.');
					return state; // Only proceed if actually exiting
				}

				const newState = {
					...state,
					// Box state should already be correct from animateView interpolation
					// Clear fullscreen state
					fullscreenBoxId: null,
					originalBoxState: null,
					isAnimatingFullscreen: false, // Clear animation flag
					fullscreenTransitionStartTime: null // Clear transition time
				};
				console.log('[canvasStore] State *after* _finalizeExitFullscreen modifications:', newState);
				return newState;
			});
		},

		setAnimatingDoublezoom: (isAnimating: boolean) => {
			update((state) => ({ ...state, isAnimatingDoublezoom: isAnimating }));
		},

		restorePreviousView: () => {
			update((state) => {
				if (state.zoomedBoxId === null) return state;
				return {
					...state,
					targetZoom: state.prevZoom,
					targetOffsetX: state.prevOffsetX,
					targetOffsetY: state.prevOffsetY,
					zoomedBoxId: null,
					isAnimatingDoublezoom: true
				};
			});
		},

		zoomToBox: (boxId: number, viewportWidth: number, viewportHeight: number) => {
			update((state) => {
				const box = state.boxes.find((b) => b.id === boxId);
				if (!box) return state;

				// Store current target view as previous view
				const currentTargetZoom = state.targetZoom;
				const currentTargetOffsetX = state.targetOffsetX;
				const currentTargetOffsetY = state.targetOffsetY;

				// Calculate new target view
				const zoomX = (viewportWidth / box.width) * ZOOM_PADDING_FACTOR;
				const zoomY = (viewportHeight / box.height) * ZOOM_PADDING_FACTOR;
				const newTargetZoom = Math.min(zoomX, zoomY, 10); // Cap max zoom

				const boxCenterX = box.x + box.width / 2;
				const boxCenterY = box.y + box.height / 2;

				const newTargetOffsetX = viewportWidth / 2 - boxCenterX * newTargetZoom;
				const newTargetOffsetY = viewportHeight / 2 - boxCenterY * newTargetZoom;

				return {
					...state,
					prevZoom: currentTargetZoom,
					prevOffsetX: currentTargetOffsetX,
					prevOffsetY: currentTargetOffsetY,
					targetZoom: newTargetZoom,
					targetOffsetX: newTargetOffsetX,
					targetOffsetY: newTargetOffsetY,
					zoomedBoxId: boxId,
					isAnimatingDoublezoom: true,
					// Clear fullscreen if zooming to a box
					fullscreenBoxId: null,
					originalBoxState: null
				};
			});
		},

		// Method to clear the animation flag (called by animation loop completion)
		clearAnimatingFullscreen: () => {
			update((state) => ({ ...state, isAnimatingFullscreen: false }));
		}
	};
}

export const canvasStore = createCanvasStore();
