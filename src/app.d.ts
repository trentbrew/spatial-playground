// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Debug interface for window object
	interface Window {
		canvasStore?: any;
		getFocusZoomForZ?: (z: number) => number;
		getIntrinsicScaleFactor?: (z: number) => number;
		getParallaxFactor?: (z: number) => number;
		runAnimationTests?: () => void;
		animationTracer?: any;
		traceZoomToBox?: (boxId?: number) => any;
		stopTrace?: () => any;
		exportTrace?: () => void;
		getAllTraces?: () => any[];
	}
}

export {};
