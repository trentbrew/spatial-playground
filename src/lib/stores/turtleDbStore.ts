import { v4 as uuidv4 } from 'uuid';
import { writable } from 'svelte/store';

// Conditional import to avoid memory issues in production builds
let GraphCore: any = null;
let isInitialized = false;

// Initialize turtle-db only when needed and available
async function initializeTurtleDb() {
	if (isInitialized) return;

	// Skip in production builds to avoid memory issues
	if (typeof process !== 'undefined' && process.env.DISABLE_TURTLE_DB === 'true') {
		console.log('turtle-db disabled in production build');
		return;
	}

	try {
		const turtleDb = await import('/Users/trentbrew/turtle/projects/modules/turtle-db/module/dist');
		GraphCore = turtleDb.GraphCore;
		isInitialized = true;
		console.log('turtle-db initialized successfully');
	} catch (error) {
		console.warn('turtle-db not available:', error);
	}
}

// --- Define a basic schema for demo ---
const schema = {
	nodes: {
		id: 'string',
		type: 'string',
		content: 'any',
		x: 'number',
		y: 'number',
		width: 'number',
		height: 'number',
		tags: 'array'
	},
	edges: {
		id: 'string',
		from: 'string',
		to: 'string',
		type: 'string'
	}
};

// --- Mock data for when turtle-db is not available ---
const mockNodes = writable([]);
const mockEdges = writable([]);

// --- Core store ---
const { subscribe, set, update } = writable({
	nodes: [],
	edges: [],
	isConnected: false,
	isLoading: false
});

// --- Methods ---
async function addNode(nodeData: any) {
	if (!GraphCore) {
		// Fallback to mock data
		const newNode = { id: uuidv4(), ...nodeData };
		mockNodes.update((nodes) => [...nodes, newNode]);
		update((state) => ({ ...state, nodes: [...state.nodes, newNode] }));
		return newNode;
	}

	// Original turtle-db implementation would go here
	const newNode = { id: uuidv4(), ...nodeData };
	update((state) => ({ ...state, nodes: [...state.nodes, newNode] }));
	return newNode;
}

async function updateNode(id: string, updates: any) {
	if (!GraphCore) {
		// Fallback to mock data
		mockNodes.update((nodes) =>
			nodes.map((node) => (node.id === id ? { ...node, ...updates } : node))
		);
		update((state) => ({
			...state,
			nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...updates } : node))
		}));
		return;
	}

	// Original turtle-db implementation would go here
	update((state) => ({
		...state,
		nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...updates } : node))
	}));
}

async function deleteNode(id: string) {
	if (!GraphCore) {
		// Fallback to mock data
		mockNodes.update((nodes) => nodes.filter((node) => node.id !== id));
		update((state) => ({ ...state, nodes: state.nodes.filter((node) => node.id !== id) }));
		return;
	}

	// Original turtle-db implementation would go here
	update((state) => ({ ...state, nodes: state.nodes.filter((node) => node.id !== id) }));
}

async function addEdge(edgeData: any) {
	if (!GraphCore) {
		// Fallback to mock data
		const newEdge = { id: uuidv4(), ...edgeData };
		mockEdges.update((edges) => [...edges, newEdge]);
		update((state) => ({ ...state, edges: [...state.edges, newEdge] }));
		return newEdge;
	}

	// Original turtle-db implementation would go here
	const newEdge = { id: uuidv4(), ...edgeData };
	update((state) => ({ ...state, edges: [...state.edges, newEdge] }));
	return newEdge;
}

// Initialize on first import (but only in development)
if (typeof window !== 'undefined') {
	initializeTurtleDb();
}

export const turtleDbStore = {
	subscribe,
	isAvailable: () => GraphCore !== null,
	addNode,
	updateNode,
	deleteNode,
	addEdge,
	initialize: initializeTurtleDb
};
