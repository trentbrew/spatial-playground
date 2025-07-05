declare module '@lucide/svelte/icons/*.svelte' {
	import { SvelteComponentTyped } from 'svelte';
	export default class Icon extends SvelteComponentTyped<Record<string, any>> {}
}

declare module '@lucide/svelte/dist/icons/*.svelte' {
	import { SvelteComponentTyped } from 'svelte';
	export default class Icon extends SvelteComponentTyped<Record<string, any>> {}
}

declare module '@lucide/svelte' {
	import { SvelteComponentTyped } from 'svelte';
	export const StickyNote: typeof SvelteComponentTyped<any>;
	export const Code: typeof SvelteComponentTyped<any>;
	export const Image: typeof SvelteComponentTyped<any>;
	export const Globe: typeof SvelteComponentTyped<any>;
	export const Clipboard: typeof SvelteComponentTyped<any>;
	export const ZoomIn: typeof SvelteComponentTyped<any>;
	export const Target: typeof SvelteComponentTyped<any>;
	export const Shuffle: typeof SvelteComponentTyped<any>;
	// Fallback export for the module root
	const Lucide: typeof SvelteComponentTyped<any>;
	export default Lucide;
}

declare module '*.json?raw' {
	const content: string;
	export default content;
}
