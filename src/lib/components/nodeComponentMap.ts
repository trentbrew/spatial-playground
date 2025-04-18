import StickyNoteNode from './nodes/StickyNoteNode.svelte';

export const nodeComponentMap: Record<string, any> = {
	sticky: StickyNoteNode
	// Add other node types here, e.g. button: ButtonNode
};
