import { v4 as uuidv4 } from 'uuid';
import { writable } from 'svelte/store';

// Turtle-db is disabled in production builds to avoid memory issues
// This is a no-op implementation for compatibility

export const turtleDbStore = {
	isAvailable: () => false,

	// Placeholder methods when turtle-db is not available
	createNode: (...args: any[]) => {
		console.warn('turtle-db not available');
		return null;
	},

	updateNode: (...args: any[]) => {
		console.warn('turtle-db not available');
		return null;
	},

	deleteNode: (...args: any[]) => {
		console.warn('turtle-db not available');
		return null;
	},

	queryNodes: (...args: any[]) => {
		console.warn('turtle-db not available');
		return [];
	},

	subscribe: (callback: any) => {
		// Return empty unsubscribe function
		return () => {};
	}
};

// Export individual functions for backward compatibility
export const addNode = turtleDbStore.createNode;
export const updateNode = turtleDbStore.updateNode;
export const deleteNode = turtleDbStore.deleteNode;
export const loadNodes = async () => {
	console.warn('turtle-db not available');
	return [];
};

// Graph management functions (no-op)
export const createNewGraph = async () => {
	console.log('turtle-db not available - graph functionality disabled');
};

export const switchGraph = async (graphId: string) => {
	console.log('turtle-db not available - graph functionality disabled');
};

export const getGraphIds = () => {
	return [];
};

export const currentGraphId = writable(null);
