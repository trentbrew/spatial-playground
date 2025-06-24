import { zero, queries, mutators } from './zeroStore.svelte';
import type { AppBoxState } from '$lib/canvasState';
import { writable } from 'svelte/store';

// Helper to convert Zero box format to your AppBoxState format
function convertZeroBoxToAppBox(zeroBox: any): AppBoxState {
	return {
		id: parseInt(zeroBox.id),
		x: zeroBox.x,
		y: zeroBox.y,
		width: zeroBox.width,
		height: zeroBox.height,
		z: zeroBox.z_index ?? 0, // Use z_index from Zero
		type: zeroBox.type,
		content: zeroBox.content || {},
		color: '#2a2a2a' // Default color
	};
}

// Helper to convert AppBoxState to Zero format
function convertAppBoxToZero(appBox: AppBoxState): any {
	return {
		id: appBox.id.toString(),
		x: appBox.x,
		y: appBox.y,
		width: appBox.width,
		height: appBox.height,
		z_index: appBox.z, // Persist z-index
		type: appBox.type,
		content: appBox.content
	};
}

// Simple reactive stores
const canvasStateStore = writable<any>(null);
const boxesStore = writable<any[]>([]);

// Reactive class using standard Svelte stores
export class CanvasZeroAdapter {
	// Public stores
	canvasState = canvasStateStore;
	allNodes = boxesStore;

	// Private properties
	private pollInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		// Subscribe to Zero queries
		if (typeof window !== 'undefined') {
			this.#initializeSubscriptions();
		}
	}

	async #initializeSubscriptions() {
		// Poll Zero every 500ms for better responsiveness
		const pollInterval = setInterval(async () => {
			try {
				// Check for canvas state
				const canvas = await queries.canvasState();
				if (canvas) {
					canvasStateStore.set(canvas);
				}

				// Check for boxes
				const boxes = await queries.allBoxes();
				if (boxes) {
					boxesStore.set(Array.isArray(boxes) ? boxes : []);
				}
			} catch (error) {
				// Only log actual errors, not expected initial empty state
				if (error?.message && !error.message.includes('not found')) {
					console.debug('Zero polling error (expected during startup):', error);
				}
			}
		}, 500); // Faster polling for better real-time feel

		// Store interval ID for cleanup
		this.pollInterval = pollInterval;
	}

	// Current values (non-reactive)
	get zoom() {
		let current: any = null;
		this.canvasState.subscribe((val) => (current = val))();
		return current?.zoom ?? 1;
	}

	get offsetX() {
		let current: any = null;
		this.canvasState.subscribe((val) => (current = val))();
		return current?.offsetX ?? 0;
	}

	get offsetY() {
		let current: any = null;
		this.canvasState.subscribe((val) => (current = val))();
		return current?.offsetY ?? 0;
	}

	get persistenceEnabled() {
		let current: any = null;
		this.canvasState.subscribe((val) => (current = val))();
		return current?.persistenceEnabled ?? true;
	}

	// Mutation methods
	async updateViewport(updates: {
		zoom?: number;
		offsetX?: number;
		offsetY?: number;
		selectedBoxId?: number | null;
		fullscreenBoxId?: number | null;
		lastSelectedBoxId?: number | null;
		persistenceEnabled?: boolean;
	}) {
		// Updating viewport in Zero
		await mutators.updateViewport({
			...updates,
			selectedBoxId: updates.selectedBoxId?.toString() || null,
			fullscreenBoxId: updates.fullscreenBoxId?.toString() || null,
			lastSelectedBoxId: updates.lastSelectedBoxId?.toString() || null
		});
	}

	async addNode(box: {
		x: number;
		y: number;
		width: number;
		height: number;
		type: string;
		content: any;
		z?: number;
	}) {
		const id = Date.now().toString(); // Simple ID for now
		await mutators.addBox({
			id,
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			z_index: box.z ?? 0, // Use provided z or default to 0
			type: box.type,
			content: box.content
		});
	}

	async updateBox(id: number, updates: Partial<AppBoxState>) {
		const zeroUpdates: any = {
			x: updates.x,
			y: updates.y,
			width: updates.width,
			height: updates.height,
			z_index: updates.z, // Persist z-index if present
			content: updates.content
		};
		const cleanUpdates = Object.fromEntries(
			Object.entries(zeroUpdates).filter(([_, value]) => value !== undefined)
		);
		await mutators.updateBox(id.toString(), cleanUpdates);
	}

	async deleteBox(id: number) {
		// Deleting box from Zero
		await mutators.deleteBox(id.toString());
	}

	// Initialize with default data if empty
	async initializeDefaults() {
		// Initializing defaults in Zero...

		// Ensure canvas state exists
		try {
			await mutators.initializeCanvasState();
		} catch (error) {
			console.log('Canvas state already exists or error:', error);
		}
	}

	// Clean up resources
	destroy() {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}
}

// Export a singleton instance
export const canvasZeroAdapter = new CanvasZeroAdapter();

// Initialize defaults
if (typeof window !== 'undefined') {
	canvasZeroAdapter.initializeDefaults();
}

// Export Zero client for advanced usage
export { zero };
