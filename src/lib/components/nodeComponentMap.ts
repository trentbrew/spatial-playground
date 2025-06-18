import StickyNoteNode from './nodes/StickyNoteNode.svelte';
import ImageNode from './nodes/ImageNode.svelte';
import EmbedNode from './nodes/EmbedNode.svelte';

export const nodeComponentMap: Record<string, any> = {
	sticky: StickyNoteNode,
	image: ImageNode,
	embed: EmbedNode
	// Add other node types here, e.g. button: ButtonNode
};
