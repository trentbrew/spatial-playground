import StickyNoteNode from './nodes/StickyNoteNode.svelte';
import ImageNode from './nodes/ImageNode.svelte';
import EmbedNode from './nodes/EmbedNode.svelte';
import CodeNode from './nodes/CodeNode.svelte';
import PDFNode from './nodes/PDFNode.svelte';
import AudioNode from './nodes/AudioNode.svelte';

export const nodeComponentMap: Record<string, any> = {
	sticky: StickyNoteNode,
	image: ImageNode,
	embed: EmbedNode,
	code: CodeNode,
	pdf: PDFNode,
	audio: AudioNode
	// Add other node types here, e.g. button: ButtonNode
};
