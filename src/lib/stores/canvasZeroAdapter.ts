import { zero, queries, mutators } from './zeroStore';
import type { AppBoxState } from '$lib/canvasState';
import { writable, get } from 'svelte/store';

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
		content: zeroBox.content,
		tags: zeroBox.tags || zeroBox.content?.tags || [],
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
		content: appBox.content,
		tags: appBox.tags || []
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
	private isPaused = false;

	constructor() {
		// Subscribe to Zero queries
		if (typeof window !== 'undefined') {
			this.#initializeSubscriptions();
		}
	}

	async #poll() {
		try {
			// Check for canvas state, but only emit if something actually changed
			const canvas = await queries.canvasState();
			if (canvas) {
				const currentCanvas = get(canvasStateStore);
				const hasCanvasChanged =
					!currentCanvas ||
					currentCanvas.zoom !== canvas.zoom ||
					currentCanvas.offsetX !== canvas.offsetX ||
					currentCanvas.offsetY !== canvas.offsetY ||
					currentCanvas.selectedBoxId !== canvas.selectedBoxId ||
					currentCanvas.fullscreenBoxId !== canvas.fullscreenBoxId ||
					currentCanvas.lastSelectedBoxId !== canvas.lastSelectedBoxId;

				if (hasCanvasChanged) {
					canvasStateStore.set(canvas);
				}
			}

			// Check for boxes — shallow-compare by id/position/size/z to avoid emitting identical arrays
			const zeroBoxes = await queries.allBoxes();
			if (zeroBoxes) {
				const incoming = Array.isArray(zeroBoxes) ? zeroBoxes : [];
				const current = get(boxesStore);

				const haveBoxesChanged = () => {
					if (current.length !== incoming.length) return true;
					const byId = new Map(current.map((b: any) => [b.id, b]));
					for (const nb of incoming) {
						const ob = byId.get(nb.id);
						if (!ob) return true;
						if (
							ob.x !== nb.x ||
							ob.y !== nb.y ||
							ob.width !== nb.width ||
							ob.height !== nb.height ||
							ob.z_index !== (nb.z_index ?? 0)
						) {
							return true;
						}
					}
					return false;
				};

				if (haveBoxesChanged()) {
					boxesStore.set(incoming);
				}
			}
		} catch (error) {
			// Only log actual errors, not expected initial empty state
			if (error?.message && !error.message.includes('not found')) {
				console.debug('Zero polling error (expected during startup):', error);
			}
		}
	}

	async #initializeSubscriptions() {
		// Poll Zero every 500ms for better responsiveness
		this.pollInterval = setInterval(async () => {
			if (this.isPaused) return; // Skip polling if paused
			await this.#poll();
		}, 500); // Faster polling for better real-time feel
	}

	// --- Polling control methods ---
	pause() {
		if (!this.isPaused) {
			this.isPaused = true;
			console.log('Adapter polling PAUSED');
		}
	}

	resume() {
		if (this.isPaused) {
			this.isPaused = false;
			console.log('Adapter polling RESUMED');
		}
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
		tags?: string[];
	}) {
		const id = Date.now().toString(); // Simple ID for now

		// Tags must be stored inside the content object for ZeroDB.
		const finalContent =
			typeof box.content === 'object' && box.content !== null
				? { ...box.content, tags: box.tags || [] }
				: { body: box.content, tags: box.tags || [] };

		await mutators.addBox({
			id,
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			z_index: box.z ?? 0, // Use provided z or default to 0
			type: box.type,
			content: finalContent
		});
	}

	async updateBox(id: number, updates: Partial<AppBoxState>) {
		const { tags, content, ...rest } = updates;

		// Remap z to z_index for the database
		const zeroUpdates: any = { ...rest };
		if (zeroUpdates.z !== undefined) {
			zeroUpdates.z_index = zeroUpdates.z;
			delete zeroUpdates.z;
		}

		// If 'content' or 'tags' are part of the update, they must be merged
		// and sent inside a 'content' field. This assumes the backend deep-merges
		// the content object, which is standard for such operations.
		if (content !== undefined || tags !== undefined) {
			const contentUpdate: any = {};
			if (content !== undefined) {
				// If content is a primitive, wrap it in an object.
				if (typeof content === 'object' && content !== null) {
					Object.assign(contentUpdate, content);
				} else {
					contentUpdate.body = content;
				}
			}
			if (tags !== undefined) {
				contentUpdate.tags = tags;
			}
			zeroUpdates.content = contentUpdate;
		}

		const cleanUpdates = Object.fromEntries(
			Object.entries(zeroUpdates).filter(([_, value]) => value !== undefined)
		);

		if (Object.keys(cleanUpdates).length > 0) {
			await mutators.updateBox(id.toString(), cleanUpdates);
		}
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
