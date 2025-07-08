import { canvasStore } from './canvasStore.svelte.ts';
import { canvasZeroAdapter } from './canvasZeroAdapter';
import type { AppBoxState } from '$lib/canvasState';

export interface Canvas {
	id: string;
	name: string;
	boxes: AppBoxState[];
	viewport: {
		zoom: number;
		offsetX: number;
		offsetY: number;
	};
	createdAt: number;
	updatedAt: number;
	isDefault?: boolean;
}

// State
let canvases = $state<Canvas[]>([]);
let activeCanvasId = $state<string | null>(null);
let isLoading = $state(true); // Start as loading

// Constants
const STORAGE_KEY = 'canvas-engine-canvases';
const ACTIVE_CANVAS_KEY = 'canvas-engine-active-canvas';
const DEFAULT_GALLERY_ID = 'default-gallery';

// Helper functions
function generateId(): string {
	return `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createWelcomeNote(): AppBoxState {
	return {
		id: Date.now(),
		x: -200,
		y: -100,
		width: 400,
		height: 200,
		z: 0,
		type: 'note',
		content: {
			body: '# Welcome to Canvas Engine\n\nThis is your blank canvas. Start creating by:\n- Right-clicking to open the context menu\n- Dragging to pan around\n- Scrolling to zoom in/out\n- Double-clicking nodes to focus on them',
			tags: ['welcome', 'tutorial']
		},
		tags: ['welcome', 'tutorial'],
		color: '#2a2a2a'
	};
}

async function createDefaultGallery(): Promise<Canvas> {
	// Generate the artwork gallery
	await canvasStore.regenerateScene();

	// Get the generated boxes
	const galleryBoxes = canvasStore.boxes;

	return {
		id: DEFAULT_GALLERY_ID,
		name: 'Artwork Gallery',
		boxes: [...galleryBoxes],
		viewport: {
			zoom: canvasStore.zoom,
			offsetX: canvasStore.offsetX,
			offsetY: canvasStore.offsetY
		},
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isDefault: true
	};
}

// Load canvases from localStorage
async function loadCanvases() {
	isLoading = true;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			canvases = JSON.parse(stored);
		}

		// Ensure default gallery exists
		if (!canvases.find((c) => c.id === DEFAULT_GALLERY_ID)) {
			const gallery = await createDefaultGallery();
			canvases = [gallery, ...canvases];
			saveCanvases();
		}

		// Load active canvas ID
		const storedActiveId = localStorage.getItem(ACTIVE_CANVAS_KEY);
		if (storedActiveId && canvases.find((c) => c.id === storedActiveId)) {
			activeCanvasId = storedActiveId;
		} else {
			// Default to gallery if no active canvas
			activeCanvasId = DEFAULT_GALLERY_ID;
		}

		// Load the active canvas into canvasStore
		const activeCanvas = canvases.find((c) => c.id === activeCanvasId);
		if (activeCanvas) {
			await loadCanvas(activeCanvas);
		}
	} catch (error) {
		console.error('Failed to load canvases:', error);
		// Create default gallery on error
		const gallery = await createDefaultGallery();
		canvases = [gallery];
		activeCanvasId = DEFAULT_GALLERY_ID;
		saveCanvases();
	} finally {
		isLoading = false;
	}
}

// Save canvases to localStorage
function saveCanvases() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(canvases));
		if (activeCanvasId) {
			localStorage.setItem(ACTIVE_CANVAS_KEY, activeCanvasId);
		}
	} catch (error) {
		console.error('Failed to save canvases:', error);
	}
}

// Load a canvas into the canvasStore
async function loadCanvas(canvas: Canvas) {
	// Disable persistence temporarily to avoid conflicts
	canvasStore.setPersistence(false);

	// Clear current boxes
	canvasStore.boxes.length = 0;

	// Load new boxes
	for (const box of canvas.boxes) {
		canvasStore.boxes.push(box);
	}

	// Set viewport
	canvasStore._setViewport({
		zoom: canvas.viewport.zoom,
		x: canvas.viewport.offsetX,
		y: canvas.viewport.offsetY
	});

	// Re-enable persistence
	canvasStore.setPersistence(true);
}

// Save current canvas state
function saveCurrentCanvas() {
	if (!activeCanvasId) return;

	const canvasIndex = canvases.findIndex((c) => c.id === activeCanvasId);
	if (canvasIndex === -1) return;

	canvases[canvasIndex] = {
		...canvases[canvasIndex],
		boxes: [...canvasStore.boxes],
		viewport: {
			zoom: canvasStore.zoom,
			offsetX: canvasStore.offsetX,
			offsetY: canvasStore.offsetY
		},
		updatedAt: Date.now()
	};

	saveCanvases();
}

// Initialize on module load
let initPromise: Promise<void> | null = null;

if (typeof window !== 'undefined') {
	console.log('🎯 Canvas Manager: Initializing...');

	// Disable Zero adapter when using canvas manager
	canvasZeroAdapter.disable();
	console.log('🎯 Canvas Manager: Zero adapter disabled');

	// Disable canvasStore persistence
	canvasStore.setPersistence(false);
	console.log('🎯 Canvas Manager: Canvas store persistence disabled');

	// Clean up any existing Zero subscription
	canvasStore.cleanupZeroSubscription();
	console.log('🎯 Canvas Manager: Zero subscription cleaned up');

	initPromise = loadCanvases();

	// Auto-save current canvas periodically
	setInterval(() => {
		if (activeCanvasId && !isLoading) {
			saveCurrentCanvas();
		}
	}, 5000); // Save every 5 seconds
}

// Public API
export const canvasManager = {
	// Getters
	get canvases() {
		return canvases;
	},

	get activeCanvasId() {
		return activeCanvasId;
	},

	get activeCanvas() {
		return canvases.find((c) => c.id === activeCanvasId);
	},

	get isLoading() {
		return isLoading;
	},

	// Methods
	async waitForInit() {
		if (initPromise) {
			await initPromise;
		}
	},
	async createCanvas(
		name: string = 'New Canvas',
		withWelcomeNote: boolean = true
	): Promise<string> {
		// Save current canvas first
		saveCurrentCanvas();

		const newCanvas: Canvas = {
			id: generateId(),
			name,
			boxes: withWelcomeNote ? [createWelcomeNote()] : [],
			viewport: {
				zoom: 1,
				offsetX: 0,
				offsetY: 0
			},
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		canvases = [...canvases, newCanvas];
		saveCanvases();

		// Switch to new canvas
		await canvasManager.switchToCanvas(newCanvas.id);

		return newCanvas.id;
	},

	async switchToCanvas(canvasId: string) {
		if (canvasId === activeCanvasId) return;

		// Save current canvas state
		saveCurrentCanvas();

		// Find target canvas
		const targetCanvas = canvases.find((c) => c.id === canvasId);
		if (!targetCanvas) {
			console.error('Canvas not found:', canvasId);
			return;
		}

		// Update active canvas
		activeCanvasId = canvasId;

		// Load the canvas
		await loadCanvas(targetCanvas);

		// Save active canvas preference
		localStorage.setItem(ACTIVE_CANVAS_KEY, canvasId);
	},

	renameCanvas(canvasId: string, newName: string) {
		const canvasIndex = canvases.findIndex((c) => c.id === canvasId);
		if (canvasIndex === -1) return;

		canvases[canvasIndex] = {
			...canvases[canvasIndex],
			name: newName,
			updatedAt: Date.now()
		};

		saveCanvases();
	},

	deleteCanvas(canvasId: string) {
		// Can't delete the default gallery
		if (canvasId === DEFAULT_GALLERY_ID) {
			console.warn('Cannot delete the default gallery');
			return;
		}

		// Can't delete the last canvas
		if (canvases.length <= 1) {
			console.warn('Cannot delete the last canvas');
			return;
		}

		// Remove the canvas
		canvases = canvases.filter((c) => c.id !== canvasId);

		// If it was active, switch to gallery
		if (canvasId === activeCanvasId) {
			canvasManager.switchToCanvas(DEFAULT_GALLERY_ID);
		}

		saveCanvases();
	},

	duplicateCanvas(canvasId: string): string {
		const sourceCanvas = canvases.find((c) => c.id === canvasId);
		if (!sourceCanvas) {
			console.error('Canvas not found:', canvasId);
			return '';
		}

		const newCanvas: Canvas = {
			...sourceCanvas,
			id: generateId(),
			name: `${sourceCanvas.name} (Copy)`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			isDefault: false
		};

		canvases = [...canvases, newCanvas];
		saveCanvases();

		return newCanvas.id;
	},

	// Force save current state
	saveCurrentCanvas
};
