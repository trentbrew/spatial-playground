import { describe, it, expect } from 'vitest';
import type { BoxState, GraphState } from './canvasState';
import { serializeCanvasState, prepareStateForLoad } from './canvasState';

describe('canvasState', () => {
	// --- Test Data ---
	const mockBoxes: BoxState[] = [
		{ id: 1, x: 10, y: 20, width: 100, height: 50, content: 'Box A', color: 'red' },
		{ id: 2, x: 150, y: 200, width: 80, height: 80, content: 'Box B', color: 'blue' },
	];
	const mockZoom = 1.5;
	const mockOffsetX = -50;
	const mockOffsetY = -30;

	const mockGraphState: GraphState = {
		zoom: mockZoom,
		offsetX: mockOffsetX,
		offsetY: mockOffsetY,
		boxes: mockBoxes,
	};

	// --- Tests for serializeCanvasState ---
	describe('serializeCanvasState', () => {
		it('should correctly serialize the current state', () => {
			const serialized = serializeCanvasState(mockZoom, mockOffsetX, mockOffsetY, mockBoxes);
			expect(serialized).toEqual(mockGraphState);
		});

		it('should create a deep copy of the boxes array', () => {
			const originalBoxes = [{ ...mockBoxes[0] }]; // Create a copy to modify
			const serialized = serializeCanvasState(1, 0, 0, originalBoxes);

			// Modify the original array *after* serialization
			originalBoxes[0].content = 'MODIFIED';

			// Ensure the serialized version is unchanged
			expect(serialized.boxes[0].content).toBe('Box A');
			expect(serialized.boxes).not.toBe(originalBoxes); // Check for different array references
		});
	});

	// --- Tests for prepareStateForLoad ---
	describe('prepareStateForLoad', () => {
		it('should return the correct target state values for loading', () => {
			const prepared = prepareStateForLoad(mockGraphState);

			expect(prepared.targetZoom).toBe(mockZoom);
			expect(prepared.targetOffsetX).toBe(mockOffsetX);
			expect(prepared.targetOffsetY).toBe(mockOffsetY);
			expect(prepared.newBoxes).toEqual(mockBoxes);
		});

		it('should create a deep copy of the boxes array for loading', () => {
			const stateToLoad = { ...mockGraphState, boxes: [{ ...mockBoxes[0] }] };
			const prepared = prepareStateForLoad(stateToLoad);

			// Modify the state *after* preparing it for load
			stateToLoad.boxes[0].content = 'MODIFIED';

			// Ensure the prepared version is unchanged
			expect(prepared.newBoxes[0].content).toBe('Box A');
			expect(prepared.newBoxes).not.toBe(stateToLoad.boxes); // Check references
		});
	});
});
