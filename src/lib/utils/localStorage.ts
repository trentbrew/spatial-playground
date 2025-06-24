import type { AppBoxState } from '$lib/canvasState';

export interface CanvasPersistedState {
	zoom: number;
	offsetX: number;
	offsetY: number;
	boxes: AppBoxState[];
	// Store metadata about when the state was saved
	savedAt: string;
	version: string;
}

const CANVAS_STATE_KEY = 'canvas-engine-state';
const CURRENT_VERSION = '1.0.0';

/**
 * Saves the canvas state to localStorage
 */
export function saveCanvasState(state: {
	zoom: number;
	offsetX: number;
	offsetY: number;
	boxes: AppBoxState[];
}): void {
	if (typeof window === 'undefined') return;

	try {
		const persistedState: CanvasPersistedState = {
			...state,
			savedAt: new Date().toISOString(),
			version: CURRENT_VERSION
		};

		localStorage.setItem(CANVAS_STATE_KEY, JSON.stringify(persistedState));
		console.log('✅ Canvas state saved to localStorage');
	} catch (error) {
		console.error('❌ Failed to save canvas state to localStorage:', error);
	}
}

/**
 * Loads the canvas state from localStorage
 */
export function loadCanvasState(): CanvasPersistedState | null {
	if (typeof window === 'undefined') return null;

	try {
		const stored = localStorage.getItem(CANVAS_STATE_KEY);
		if (!stored) return null;

		const parsed = JSON.parse(stored) as CanvasPersistedState;

		// Basic validation
		if (!parsed.boxes || !Array.isArray(parsed.boxes)) {
			console.warn('⚠️ Invalid canvas state in localStorage, ignoring');
			return null;
		}

		// Version compatibility check
		if (parsed.version !== CURRENT_VERSION) {
			console.warn(
				`⚠️ Canvas state version mismatch: stored ${parsed.version}, current ${CURRENT_VERSION}`
			);
			// For now, we'll still try to load it, but in the future we could add migration logic
		}

		console.log(`✅ Canvas state loaded from localStorage (saved: ${parsed.savedAt})`);
		return parsed;
	} catch (error) {
		console.error('❌ Failed to load canvas state from localStorage:', error);
		return null;
	}
}

/**
 * Clears the canvas state from localStorage
 */
export function clearCanvasState(): void {
	if (typeof window === 'undefined') return;

	try {
		localStorage.removeItem(CANVAS_STATE_KEY);
		console.log('✅ Canvas state cleared from localStorage');
	} catch (error) {
		console.error('❌ Failed to clear canvas state from localStorage:', error);
	}
}

/**
 * Checks if there's a saved canvas state in localStorage
 */
export function hasCanvasState(): boolean {
	if (typeof window === 'undefined') return false;
	return localStorage.getItem(CANVAS_STATE_KEY) !== null;
}

/**
 * Gets metadata about the saved state without loading the full state
 */
export function getCanvasStateMetadata(): { savedAt: string; version: string } | null {
	if (typeof window === 'undefined') return null;

	try {
		const stored = localStorage.getItem(CANVAS_STATE_KEY);
		if (!stored) return null;

		const parsed = JSON.parse(stored) as CanvasPersistedState;
		return {
			savedAt: parsed.savedAt,
			version: parsed.version
		};
	} catch (error) {
		console.error('❌ Failed to get canvas state metadata:', error);
		return null;
	}
}
