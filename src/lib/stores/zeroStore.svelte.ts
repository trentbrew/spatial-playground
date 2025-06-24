import { Zero } from '@rocicorp/zero';
import { schema } from '../schema';

// Create Zero client in local-only mode for Phase 1
export const zero = new Zero({
	schema,

	// Local-only mode - no server required
	userID: 'local-user',

	// Enable debug logging during development
	logLevel: 'debug'
});

// Reactive queries for Svelte
export class ZeroQueries {
	constructor(private zero: Zero<typeof schema>) {}

	// Get canvas state (singleton)
	canvasState() {
		return this.zero.query.canvas_state.where('id', 'viewport').one();
	}

	// Get all boxes
	allBoxes() {
		return this.zero.query.nodes.orderBy('created_at', 'asc');
	}

	// Get a specific box by ID
	box(id: string) {
		return this.zero.query.nodes.where('id', id).one();
	}

	// Get selected box
	selectedBox(selectedBoxId: string | null) {
		if (!selectedBoxId) return null;
		return this.zero.query.nodes.where('id', selectedBoxId).one();
	}
}

export const queries = new ZeroQueries(zero);

// Mutators for data changes
export class ZeroMutators {
	constructor(private zero: Zero<typeof schema>) {}

	// Initialize canvas state if it doesn't exist
	async initializeCanvasState() {
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
		await this.zero.mutate.nodes.update({
			id,
			...updates,
			updated_at: new Date().toISOString()
		});
	}

	// Delete a box
	async deleteBox(id: string) {
		await this.zero.mutate.nodes.delete({
			id
		});
	}
}

export const mutators = new ZeroMutators(zero);

// Initialize on first load
if (typeof window !== 'undefined') {
	mutators.initializeCanvasState();
}
