import { canvasStore } from './canvasStore.svelte';
import type { AppBoxState } from '$lib/canvasState';

// Connection types and interfaces
export interface Connection {
	id: string;
	sourceNodeId: number;
	targetNodeId: number;
	type: ConnectionType;
	style: ConnectionStyle;
	label?: string;
	color?: string;
	created?: number; // timestamp
}

export type ConnectionType =
	| 'flow'
	| 'dependency'
	| 'reference'
	| 'relationship'
	| 'hierarchy'
	| 'custom';

export interface ConnectionStyle {
	strokeWidth: number;
	strokeDashArray?: string;
	arrowType: 'none' | 'arrow' | 'diamond' | 'circle';
	curve: 'straight' | 'bezier' | 'orthogonal';
	animate?: boolean;
}

export interface ConnectionPoint {
	x: number;
	y: number;
	nodeId: number;
	side: 'top' | 'right' | 'bottom' | 'left' | 'center';
}

// Connection drawing state
interface DrawingState {
	isDrawing: boolean;
	startPoint: ConnectionPoint | null;
	currentPoint: { x: number; y: number } | null;
	previewConnection: Connection | null;
}

// Store state
let connections = $state<Connection[]>([]);
let selectedConnectionId = $state<string | null>(null);
let drawingState = $state<DrawingState>({
	isDrawing: false,
	startPoint: null,
	currentPoint: null,
	previewConnection: null
});

// Default styles for different connection types
const DEFAULT_STYLES: Record<ConnectionType, ConnectionStyle> = {
	flow: {
		strokeWidth: 2,
		arrowType: 'arrow',
		curve: 'bezier',
		animate: true
	},
	dependency: {
		strokeWidth: 1.5,
		strokeDashArray: '5,5',
		arrowType: 'arrow',
		curve: 'straight'
	},
	reference: {
		strokeWidth: 1,
		strokeDashArray: '2,3',
		arrowType: 'circle',
		curve: 'bezier'
	},
	relationship: {
		strokeWidth: 2,
		arrowType: 'none',
		curve: 'bezier'
	},
	hierarchy: {
		strokeWidth: 2.5,
		arrowType: 'diamond',
		curve: 'orthogonal'
	},
	custom: {
		strokeWidth: 2,
		arrowType: 'arrow',
		curve: 'bezier'
	}
};

// Color palette for connections
const CONNECTION_COLORS = [
	'#3B82F6', // Blue
	'#10B981', // Green
	'#F59E0B', // Yellow
	'#EF4444', // Red
	'#8B5CF6', // Purple
	'#F97316', // Orange
	'#06B6D4', // Cyan
	'#84CC16', // Lime
	'#EC4899', // Pink
	'#6B7280' // Gray
];

// Helper functions
function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getRandomColor(): string {
	return CONNECTION_COLORS[Math.floor(Math.random() * CONNECTION_COLORS.length)];
}

function getNodeCenter(node: AppBoxState): { x: number; y: number } {
	return {
		x: node.x + node.width / 2,
		y: node.y + node.height / 2
	};
}

function getConnectionPoint(node: AppBoxState, side: ConnectionPoint['side']): ConnectionPoint {
	const center = getNodeCenter(node);

	switch (side) {
		case 'top':
			return { x: center.x, y: node.y, nodeId: node.id, side };
		case 'right':
			return { x: node.x + node.width, y: center.y, nodeId: node.id, side };
		case 'bottom':
			return { x: center.x, y: node.y + node.height, nodeId: node.id, side };
		case 'left':
			return { x: node.x, y: center.y, nodeId: node.id, side };
		case 'center':
		default:
			return { x: center.x, y: center.y, nodeId: node.id, side: 'center' };
	}
}

function findClosestConnectionPoint(
	node: AppBoxState,
	targetX: number,
	targetY: number
): ConnectionPoint {
	const sides: ConnectionPoint['side'][] = ['top', 'right', 'bottom', 'left'];
	let closestPoint = getConnectionPoint(node, 'center');
	let minDistance = Infinity;

	sides.forEach((side) => {
		const point = getConnectionPoint(node, side);
		const distance = Math.sqrt(Math.pow(point.x - targetX, 2) + Math.pow(point.y - targetY, 2));

		if (distance < minDistance) {
			minDistance = distance;
			closestPoint = point;
		}
	});

	return closestPoint;
}

function getNodesAt(x: number, y: number): AppBoxState[] {
	return canvasStore.boxes.filter(
		(node) => x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height
	);
}

function generateSVGPath(
	start: ConnectionPoint,
	end: ConnectionPoint,
	style: ConnectionStyle
): string {
	const { curve } = style;

	switch (curve) {
		case 'straight':
			return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

		case 'orthogonal':
			const midX = (start.x + end.x) / 2;
			return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;

		case 'bezier':
		default:
			const dx = end.x - start.x;
			const dy = end.y - start.y;

			// Calculate control points based on connection sides
			let cp1x = start.x;
			let cp1y = start.y;
			let cp2x = end.x;
			let cp2y = end.y;

			const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5;

			switch (start.side) {
				case 'right':
					cp1x += offset;
					break;
				case 'left':
					cp1x -= offset;
					break;
				case 'top':
					cp1y -= offset;
					break;
				case 'bottom':
					cp1y += offset;
					break;
			}

			switch (end.side) {
				case 'right':
					cp2x += offset;
					break;
				case 'left':
					cp2x -= offset;
					break;
				case 'top':
					cp2y -= offset;
					break;
				case 'bottom':
					cp2y += offset;
					break;
			}

			return `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`;
	}
}

// Store interface
export const connectionsStore = {
	// State getters
	get connections() {
		return connections;
	},

	get selectedConnectionId() {
		return selectedConnectionId;
	},

	get drawingState() {
		return drawingState;
	},

	get isDrawing() {
		return drawingState.isDrawing;
	},

	// Connection management
	addConnection(
		sourceNodeId: number,
		targetNodeId: number,
		type: ConnectionType = 'flow',
		customStyle?: Partial<ConnectionStyle>,
		customColor?: string
	): string {
		if (sourceNodeId === targetNodeId) {
			console.warn('Cannot create connection to the same node');
			return '';
		}

		// Check if connection already exists
		const existing = connections.find(
			(conn) =>
				(conn.sourceNodeId === sourceNodeId && conn.targetNodeId === targetNodeId) ||
				(conn.sourceNodeId === targetNodeId && conn.targetNodeId === sourceNodeId)
		);

		if (existing) {
			console.warn('Connection already exists between these nodes');
			return existing.id;
		}

		const id = generateConnectionId();
		const style = { ...DEFAULT_STYLES[type], ...customStyle };
		const color = customColor || getRandomColor();

		const newConnection: Connection = {
			id,
			sourceNodeId,
			targetNodeId,
			type,
			style,
			color,
			created: Date.now()
		};

		connections = [...connections, newConnection];
		return id;
	},

	removeConnection(connectionId: string) {
		connections = connections.filter((conn) => conn.id !== connectionId);
		if (selectedConnectionId === connectionId) {
			selectedConnectionId = null;
		}
	},

	updateConnection(connectionId: string, updates: Partial<Connection>) {
		connections = connections.map((conn) =>
			conn.id === connectionId ? { ...conn, ...updates } : conn
		);
	},

	selectConnection(connectionId: string | null) {
		selectedConnectionId = connectionId;
	},

	// Drawing interactions
	startDrawing(worldX: number, worldY: number) {
		const nodesAtPoint = getNodesAt(worldX, worldY);
		if (nodesAtPoint.length === 0) return false;

		const sourceNode = nodesAtPoint[0]; // Use topmost node
		const startPoint = findClosestConnectionPoint(sourceNode, worldX, worldY);

		drawingState = {
			isDrawing: true,
			startPoint,
			currentPoint: { x: worldX, y: worldY },
			previewConnection: null
		};

		return true;
	},

	updateDrawing(worldX: number, worldY: number) {
		if (!drawingState.isDrawing || !drawingState.startPoint) return;

		drawingState.currentPoint = { x: worldX, y: worldY };

		// Check if hovering over a target node
		const nodesAtPoint = getNodesAt(worldX, worldY);
		const targetNode = nodesAtPoint.find((node) => node.id !== drawingState.startPoint!.nodeId);

		if (targetNode) {
			const endPoint = findClosestConnectionPoint(targetNode, worldX, worldY);

			drawingState.previewConnection = {
				id: 'preview',
				sourceNodeId: drawingState.startPoint.nodeId,
				targetNodeId: targetNode.id,
				type: 'flow',
				style: DEFAULT_STYLES.flow,
				color: CONNECTION_COLORS[0]
			};
		} else {
			drawingState.previewConnection = null;
		}
	},

	finishDrawing(worldX: number, worldY: number): string | null {
		if (!drawingState.isDrawing || !drawingState.startPoint) return null;

		const nodesAtPoint = getNodesAt(worldX, worldY);
		const targetNode = nodesAtPoint.find((node) => node.id !== drawingState.startPoint!.nodeId);

		let connectionId: string | null = null;

		if (targetNode) {
			connectionId = this.addConnection(drawingState.startPoint.nodeId, targetNode.id, 'flow');
		}

		// Reset drawing state
		drawingState = {
			isDrawing: false,
			startPoint: null,
			currentPoint: null,
			previewConnection: null
		};

		return connectionId;
	},

	cancelDrawing() {
		drawingState = {
			isDrawing: false,
			startPoint: null,
			currentPoint: null,
			previewConnection: null
		};
	},

	// Utility functions
	getConnectionPath(connection: Connection): string {
		const sourceNode = canvasStore.boxes.find((node) => node.id === connection.sourceNodeId);
		const targetNode = canvasStore.boxes.find((node) => node.id === connection.targetNodeId);

		if (!sourceNode || !targetNode) return '';

		const startPoint = getConnectionPoint(sourceNode, 'center');
		const endPoint = getConnectionPoint(targetNode, 'center');

		return generateSVGPath(startPoint, endPoint, connection.style);
	},

	getPreviewPath(): string {
		if (!drawingState.isDrawing || !drawingState.startPoint || !drawingState.currentPoint) {
			return '';
		}

		const startPoint = drawingState.startPoint;
		const endPoint: ConnectionPoint = {
			x: drawingState.currentPoint.x,
			y: drawingState.currentPoint.y,
			nodeId: -1,
			side: 'center'
		};

		return generateSVGPath(startPoint, endPoint, DEFAULT_STYLES.flow);
	},

	getConnectionsForNode(nodeId: number): Connection[] {
		return connections.filter(
			(conn) => conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId
		);
	},

	// Bulk operations
	removeConnectionsForNode(nodeId: number) {
		connections = connections.filter(
			(conn) => conn.sourceNodeId !== nodeId && conn.targetNodeId !== nodeId
		);
	},

	clear() {
		connections = [];
		selectedConnectionId = null;
		this.cancelDrawing();
	},

	// Export/import
	exportConnections(): Connection[] {
		return [...connections];
	},

	importConnections(importedConnections: Connection[]) {
		connections = [...importedConnections];
	}
};
