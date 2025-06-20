import StickyNoteNode from './nodes/StickyNoteNode.svelte';
import ImageNode from './nodes/ImageNode.svelte';
import EmbedNode from './nodes/EmbedNode.svelte';
import CodeNode from './nodes/CodeNode.svelte';

export const nodeComponentMap: Record<string, any> = {
	sticky: StickyNoteNode,
	image: ImageNode,
	embed: EmbedNode,
	code: CodeNode
	// Add other node types here, e.g. button: ButtonNode
};
