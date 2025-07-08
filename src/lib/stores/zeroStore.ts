import { Zero } from '@rocicorp/zero';
import { schema } from '../schema';

// Check if canvas manager is being used
const hasCanvasManager =
	typeof window !== 'undefined' && localStorage.getItem('canvas-engine-canvases');

// Create Zero client in local-only mode for Phase 1
// Only create if canvas manager is not present
export const zero = hasCanvasManager
	? null
	: new Zero({
			schema,

			// Local-only mode - no server required
			userID: 'local-user',

			// Enable debug logging during development
			logLevel: 'debug'
		});

if (hasCanvasManager) {
	console.log('🚫 Zero: Canvas manager detected, Zero client not created');
}

// Reactive queries for Svelte
export class ZeroQueries {
	constructor(private zero: Zero<typeof schema> | null) {}

	// Get canvas state (singleton)
	canvasState() {
		if (!this.zero) return null;
		return this.zero.query.canvas_state.where('id', 'viewport').one();
	}

	// Get all boxes
	allBoxes() {
		if (!this.zero) return [];
		return this.zero.query.nodes.orderBy('created_at', 'asc');
	}

	// Get a specific box by ID
	box(id: string) {
		if (!this.zero) return null;
		return this.zero.query.nodes.where('id', id).one();
	}

	// Get selected box
	selectedBox(selectedBoxId: string | null) {
		if (!this.zero || !selectedBoxId) return null;
		return this.zero.query.nodes.where('id', selectedBoxId).one();
	}
}

export const queries = new ZeroQueries(zero);

// Mutators for data changes
export class ZeroMutators {
	constructor(private zero: Zero<typeof schema> | null) {}

	// Initialize canvas state if it doesn't exist
	async initializeCanvasState() {
		if (!this.zero) return;
		const existing = await this.zero.query.canvas_state.where('id', 'viewport').one();
		if (!existing) {
			const now = new Date().toISOString();
			await this.zero.mutate.canvas_state.insert({
				id: 'viewport',
				zoom: 1,
				offsetX: 0,
				offsetY: 0,
				selectedBoxId: null,
				fullscreenBoxId: null,
				lastSelectedBoxId: null,
				persistenceEnabled: true,
				created_at: now,
				updated_at: now
			});
		}
	}

	// Update viewport state
	async updateViewport(updates: {
		zoom?: number;
		offsetX?: number;
		offsetY?: number;
		selectedBoxId?: string | null;
		fullscreenBoxId?: string | null;
		lastSelectedBoxId?: string | null;
		persistenceEnabled?: boolean;
	}) {
		if (!this.zero) return;
		await this.zero.mutate.canvas_state.update({
			id: 'viewport',
			...updates,
			updated_at: new Date().toISOString()
		});
	}

	// Add a new box
	async addBox(box: {
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
		z_index: number;
		type: string;
		content?: any;
	}) {
		if (!this.zero) return;
		const now = new Date().toISOString();
		await this.zero.mutate.nodes.insert({
			...box,
			created_at: now,
			updated_at: now
		});
	}

	// Update a box
	async updateBox(
		id: string,
		updates: {
			x?: number;
			y?: number;
			width?: number;
			height?: number;
			z_index?: number;
			content?: any;
		}
	) {
		if (!this.zero) return;
		await this.zero.mutate.nodes.update({
			id,
			...updates,
			updated_at: new Date().toISOString()
		});
	}

	// Delete a box
	async deleteBox(id: string) {
		if (!this.zero) return;
		await this.zero.mutate.nodes.delete({
			id
		});
	}
}

export const mutators = new ZeroMutators(zero);

// Initialize on first load ONLY if canvas manager is not present
if (typeof window !== 'undefined') {
	// Check if canvas manager is being used
	const hasCanvasManager = localStorage.getItem('canvas-engine-canvases');
	if (!hasCanvasManager) {
		mutators.initializeCanvasState();
	} else {
		console.log('🚫 Zero: Canvas manager detected, skipping initialization');
	}
}
