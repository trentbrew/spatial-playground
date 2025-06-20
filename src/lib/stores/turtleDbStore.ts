import { writable } from 'svelte/store';
// @ts-ignore: TurtleDB is a local module, adjust import as needed
import { GraphCore } from '/Users/trentbrew/turtle/projects/modules/turtle-db/module/dist';
import { v4 as uuidv4 } from 'uuid';

// --- Define a basic schema for demo ---
const schema = {
	node_types: {
		sticky: {
			name: 'sticky',
			description: 'Sticky note',
			data: {
				content: { type: 'string', required: true },
				color: { type: 'string', required: false }
			}
		},
		code: {
			name: 'code',
			description: 'Code block',
			data: {
				content: { type: 'string', required: true },
				language: { type: 'string', required: false }
			}
		}
		// Add more node types as needed
	},
	edge_types: {}
};

// --- Graph ID management ---
const GRAPH_IDS_KEY = 'turtledb-graph-ids';
function getGraphIds(): string[] {
	if (typeof window === 'undefined') return [];
	const ids = window.localStorage.getItem(GRAPH_IDS_KEY);
	return ids ? JSON.parse(ids) : [];
}
function saveGraphIds(ids: string[]) {
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(GRAPH_IDS_KEY, JSON.stringify(ids));
	}
}

// --- Current graph state ---
const currentGraphId = writable<string>('');
let graph: any = null;
const { subscribe, set } = writable([]);

function instantiateGraph(graphId: string) {
	graph = new GraphCore(schema, { dbName: graphId });
	// Listen for events
	graph.on('node:add', loadNodes);
	graph.on('node:update', loadNodes);
	graph.on('node:delete', loadNodes);
}

async function loadNodes() {
	if (!graph) return;
	const nodes = await graph.getNodes();
	set(nodes);
}

async function createNewGraph() {
	const newId = uuidv4();
	const ids = getGraphIds();
	ids.push(newId);
	saveGraphIds(ids);
	instantiateGraph(newId);
	currentGraphId.set(newId);
	await loadNodes();
}

async function switchGraph(graphId: string) {
	instantiateGraph(graphId);
	currentGraphId.set(graphId);
	await loadNodes();
}

async function addNode(type, data) {
	if (!graph) return;
	const node = await graph.createNode(type, data);
	await graph.save();
	await loadNodes();
	return node;
}

async function updateNode(id, data) {
	if (!graph) return;
	await graph.updateNode(id, data);
	await graph.save();
	await loadNodes();
}

async function deleteNode(id) {
	if (!graph) return;
	await graph.deleteNode(id);
	await graph.save();
	await loadNodes();
}

// --- On startup, load or create the first graph ---
if (typeof window !== 'undefined') {
	let ids = getGraphIds();
	if (ids.length === 0) {
		const newId = uuidv4();
		ids = [newId];
		saveGraphIds(ids);
	}
	instantiateGraph(ids[0]);
	currentGraphId.set(ids[0]);
	loadNodes();
}

export const turtleDbStore = { subscribe };
export {
	addNode,
	updateNode,
	deleteNode,
	loadNodes,
	createNewGraph,
	switchGraph,
	getGraphIds,
	currentGraphId
};
