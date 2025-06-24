import { table, string, number, boolean, json, createSchema } from '@rocicorp/zero';

// Simple canvas state table - singleton for now
const canvas_state = table('canvas_state')
	.columns({
		id: string(), // Always "viewport" for singleton
		zoom: number(),
		offsetX: number(),
		offsetY: number(),
		selectedBoxId: string().optional(),
		fullscreenBoxId: string().optional(),
		lastSelectedBoxId: string().optional(),
		persistenceEnabled: boolean(),
		created_at: string(), // ISO timestamp
		updated_at: string() // ISO timestamp
	})
	.primaryKey('id');

// Simple nodes table
const nodes = table('nodes')
	.columns({
		id: string(), // UUID
		x: number(),
		y: number(),
		width: number(),
		height: number(),
		z_index: number(),
		type: string(), // 'sticky-note', 'image', 'text', 'code', etc.
		content: json().optional(), // Flexible content structure
		created_at: string(), // ISO timestamp
		updated_at: string() // ISO timestamp
	})
	.primaryKey('id');

// Create the complete schema
export const schema = createSchema({
	tables: [canvas_state, nodes]
});

export { canvas_state, nodes };
