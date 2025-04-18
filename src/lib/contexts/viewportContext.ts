import { setContext, getContext } from 'svelte';
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

// Define a type for our context
export interface ViewportContext {
	elementStore: Writable<HTMLElement | null>;
	width: Writable<number>;
	height: Writable<number>;
}

export const VIEWPORT_CONTEXT_KEY = Symbol('viewport');

export function setViewportContext(contextValue: ViewportContext) {
	setContext<ViewportContext>(VIEWPORT_CONTEXT_KEY, contextValue);
}

export function getViewportContext(): ViewportContext {
	const context = getContext<ViewportContext>(VIEWPORT_CONTEXT_KEY);
	if (!context) {
		throw new Error(
			'ViewportContext not found. Make sure setViewportContext is called in a parent component.'
		);
	}
	return context;
}
