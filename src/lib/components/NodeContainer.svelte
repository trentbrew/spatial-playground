<script lang="ts">
	import { onMount } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { boxResizing } from '$lib/interactions/boxResizing';
	import { nodeComponentMap } from '$lib/components/nodeComponentMap';
	import { getViewportContext } from '$lib/contexts/viewportContext';
	import { FOCUS_TRANSITION_DURATION } from '$lib/constants';
	import { isNodeClickable } from '$lib/utils/depth';
	import { getFocusZoomForZ } from '$lib/utils/depth';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenuStore.svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import TagList from '$lib/components/TagList.svelte';
	import { inputAutoWidth } from '$lib/interactions/inputAutoWidth';

	// Icons
	import {
		X,
		File,
		Pin,
		Settings2,
		Pencil,
		Clapperboard,
		AudioLines,
		SquarePen,
		Table,
		StickyNote,
		Globe,
		Image,
		Code,
		Target,
		Copy,
		ArrowUp,
		ArrowDown,
		Trash,
		ChevronsUp,
		ChevronsDown
	} from 'lucide-svelte';

	// Icon mapping for node types
	const nodeTypeIcons: Record<string, any> = {
		sticky: Pencil,
		image: Image,
		embed: Globe,
		file: File,
		text: StickyNote,
		audio: AudioLines,
		video: Clapperboard,
		code: Code,
		table: Table,
		default: File
	};

	// Use $props() rune for component props
	let { box }: { box: AppBoxState } = $props();

	// Get viewport context
	let viewportWidth = 0;
	let viewportHeight = 0;
	let viewportContext: ReturnType<typeof getViewportContext>;
	let unsubscribeViewport: (() => void) | null = null;

	onMount(() => {
		viewportContext = getViewportContext();
		unsubscribeViewport = viewportContext.width.subscribe((w) => (viewportWidth = w));
		const unsubHeight = viewportContext.height.subscribe((h) => (viewportHeight = h));
		return () => {
			unsubscribeViewport?.();
			unsubHeight();
			// Cleanup drag listeners if component is destroyed while dragging
			if (isDragging) {
				document.removeEventListener('pointermove', handleDragMove);
				document.removeEventListener('pointerup', handleDragEnd);
				document.removeEventListener('pointercancel', handleDragEnd);
			}
		};
	});

	// Direct access to store properties (reactive)
	const selectedBoxId = $derived(canvasStore.selectedBoxId);
	const fullscreenBoxId = $derived(canvasStore.fullscreenBoxId);
	const zoomedBoxId = $derived(canvasStore.zoomedBoxId); // Track zoomed state
	const isAnimatingFullscreen = $derived(canvasStore.isAnimatingFullscreen);
	const lastSelectedBoxId = $derived(canvasStore.lastSelectedBoxId);
	const currentZoom = $derived(canvasStore.zoom); // Need current zoom level
	const ghostedBoxIds = $derived(canvasStore.ghostedBoxIds);
	const boundaryHitBoxId = $derived(canvasStore.boundaryHitBoxId);

	// Check if this box is ghosted or hit the boundary
	const isGhosted = $derived(ghostedBoxIds.has(box.id));
	const isBoundaryHit = $derived(boundaryHitBoxId === box.id);

	// Check if this node should be clickable based on focus state
	const isFocused = $derived(zoomedBoxId !== null);
	const isClickable = $derived(isNodeClickable(box.z, currentZoom, isFocused));

	// Precompute expected focus zoom for this node's depth
	const focusZoom = $derived(getFocusZoomForZ(box.z));

	const Component = nodeComponentMap[box.type] || nodeComponentMap['sticky'];

	// Component references for actions
	let containerElement: HTMLDivElement;
	let dragHandleElement: HTMLDivElement;

	// Derive a title from the node's content, handling both string and object forms
	let nodeTitle = $state('Untitled');

	$effect(() => {
		let source = '';
		if (typeof box.content === 'string') {
			source = box.content;
		} else if (box.content && typeof box.content === 'object') {
			// Prefer an explicit title field, else fall back to body/text properties
			source =
				(box.content.title as string | undefined) ??
				(box.content.body as string | undefined) ??
				(box.content.text as string | undefined) ??
				'';
		}
		nodeTitle = source.split?.('\n')[0]?.slice(0, 32) || 'Untitled';
	});

	const nodeIcon = nodeTypeIcons[box.type] || nodeTypeIcons.default;

	// 3D transform for z layer (no tilt to keep nodes axis-aligned)
	const depthFactor = 60; // px per z layer
	const zTransform = `perspective(800px) translateZ(${box.z * depthFactor}px)`;

	// Add local state for flipping and pinning
	let showSettingsBack = $state(false);
	let isPinned = $state(false); // Demo fallback, real pin logic to be added

	// Tag handlers
	function addTag(tag: string) {
		console.log('NodeContainer addTag', tag);
		canvasStore.addTag(box.id, tag);
		// Optimistically update local box reference to keep tag visible
		box = { ...box, tags: [...(box.tags || []), tag] };
	}

	function removeTag(tag: string) {
		console.log('NodeContainer removeTag', tag);
		canvasStore.removeTag(box.id, tag);
		box = { ...box, tags: (box.tags || []).filter((t) => t !== tag) };
	}

	function handleClick(event: MouseEvent) {
		// If the box is already focused, do nothing to allow content interaction.
		if (zoomedBoxId === box.id) {
			return;
		}

		// Always select the box first
		canvasStore.selectBox(box.id, viewportWidth, viewportHeight);

		// Zoom to focus on the box (this includes centering + zoom)
		canvasStore.zoomToBox(box.id, viewportWidth, viewportHeight);

		// Check for obstruction and ghost blocking nodes
		setTimeout(() => {
			// Delay slightly to allow zoom animation to start
			canvasStore.checkAndGhostObstructors(box.id, viewportWidth, viewportHeight);
		}, 100);
	}

	function handleDoubleClick(event: MouseEvent) {
		// Don't zoom out for sticky notes - let them handle double-click for editing
		if (box.type === 'sticky') {
			return;
		}

		// A double click will now restore the previous zoom level (zoom out)
		// canvasStore.restorePreviousZoom();
	}

	function handleRightClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Generate context menu items based on node state
		const items: ContextMenuItem[] = [
			{
				id: 'focus',
				label: 'Focus Node',
				icon: Target,
				disabled: selectedBoxId === box.id && zoomedBoxId === box.id
			},
			{
				id: 'duplicate',
				label: 'Duplicate',
				icon: Copy
			},
			{ id: 'sep1', label: '', separator: true },
			{
				id: 'bring-forward',
				label: 'Bring Forward',
				icon: ArrowUp
			},
			{
				id: 'send-backward',
				label: 'Send Backward',
				icon: ArrowDown
			},
			{ id: 'sep2', label: '', separator: true },
			{
				id: 'delete',
				label: 'Delete',
				icon: Trash
			}
		];

		// Show context menu at mouse position
		contextMenuStore.show(event.clientX, event.clientY, items, box.id);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			handleClick(new MouseEvent('click'));
		}
	}

	function handleDragHandleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			handleDragHandleDoubleClick(new MouseEvent('dblclick'));
		}
	}

	// New handler for double-clicking the drag handle area
	function handleDragHandleDoubleClick(event: MouseEvent) {
		if (fullscreenBoxId === box.id) {
			// Exit fullscreen if the double-click is on the handle
			event.stopPropagation();
			canvasStore.exitFullscreen();
		} else if (box.type === 'sticky') {
			// Don't zoom out for sticky notes - just prevent the action
			event.stopPropagation();
			return;
		} else {
			// If not fullscreen, treat it as a regular double-click to zoom out
			handleDoubleClick(event);
		}
	}

	function toggleFullscreen(event: MouseEvent) {
		event.stopPropagation(); // Prevent multiClick action
		if (fullscreenBoxId === box.id) {
			canvasStore.exitFullscreen();
		} else {
			canvasStore.enterFullscreen(box.id, viewportWidth, viewportHeight);
		}
	}

	function handleClose(event: MouseEvent) {
		event.stopPropagation(); // Prevent box selection
		canvasStore.deleteBox(box.id);
	}

	function handlePin(event: MouseEvent) {
		event.stopPropagation();
		isPinned = !isPinned;
	}

	function handleSettings(event: MouseEvent) {
		event.stopPropagation();
		showSettingsBack = true;
	}

	// Move node forward in Z-order
	function handleSendForward(event: MouseEvent) {
		event.stopPropagation();

		// Ensure this box is selected so store helpers target it
		canvasStore.selectBox(box.id, viewportWidth, viewportHeight);
		// Move selected box forward one layer
		canvasStore.moveSelectedForward(viewportWidth, viewportHeight);
	}

	// Move node backward in Z-order
	function handleSendBackward(event: MouseEvent) {
		event.stopPropagation();

		canvasStore.selectBox(box.id, viewportWidth, viewportHeight);
		canvasStore.moveSelectedBackward(viewportWidth, viewportHeight);
	}

	function handleBackFromSettings(event: MouseEvent) {
		event.stopPropagation();
		showSettingsBack = false;
	}

	// Drag handle implementation
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let initialBoxX = 0;
	let initialBoxY = 0;

	function handleDragStart(event: PointerEvent) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		if (fullscreenBoxId !== null) return;

		console.log('Drag started for box:', box.id);

		// Store initial positions
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		initialBoxX = box.x;
		initialBoxY = box.y;
		isDragging = true;

		// Capture pointer events
		const dragHandle = event.currentTarget as HTMLElement;
		dragHandle.setPointerCapture(event.pointerId);

		// Add event listeners
		document.addEventListener('pointermove', handleDragMove);
		document.addEventListener('pointerup', handleDragEnd);
		document.addEventListener('pointercancel', handleDragEnd);

		event.stopPropagation();
		event.preventDefault();
	}

	function handleDragMove(event: PointerEvent) {
		if (!isDragging) return;

		const dx = (event.clientX - dragStartX) / canvasStore.zoom;
		const dy = (event.clientY - dragStartY) / canvasStore.zoom;

		// Update box position directly without triggering selection/zoom
		canvasStore.updateBox(box.id, {
			x: initialBoxX + dx,
			y: initialBoxY + dy
		});
	}

	function handleDragEnd(event: PointerEvent) {
		if (!isDragging) return;

		console.log('Drag ended for box:', box.id);
		isDragging = false;

		// Remove event listeners
		document.removeEventListener('pointermove', handleDragMove);
		document.removeEventListener('pointerup', handleDragEnd);
		document.removeEventListener('pointercancel', handleDragEnd);

		// Release pointer capture
		const dragHandle = containerElement?.querySelector('.drag-handle') as HTMLElement;
		if (dragHandle) {
			dragHandle.releasePointerCapture(event.pointerId);
		}
	}
</script>

<div
	class="box {showSettingsBack ? 'flipped' : ''}"
	tabindex="0"
	onclick={handleClick}
	ondblclick={handleDoubleClick}
	oncontextmenu={handleRightClick}
	onkeydown={handleKeyDown}
	class:selected={selectedBoxId === box.id}
	class:fullscreen={fullscreenBoxId === box.id}
	class:fullscreen-transition={isAnimatingFullscreen && fullscreenBoxId === box.id}
	class:quick-focus-active={zoomedBoxId === box.id && currentZoom > 1.0}
	class:edit-mode={selectedBoxId === box.id && zoomedBoxId === box.id}
	class:ghosted={isGhosted}
	class:boundary-hit={isBoundaryHit}
	class:non-clickable={!isClickable && !isGhosted}
	class:pinned={isPinned}
	style:width="{box.width}px"
	style:height="{box.height}px"
	style:--z-brightness={box.z * 0.05}
	style:--focus-transition-duration="{FOCUS_TRANSITION_DURATION}ms"
	style:z-index={fullscreenBoxId === box.id
		? 10
		: selectedBoxId === box.id
			? 7
			: lastSelectedBoxId === box.id
				? 5
				: 1}
	style:pointer-events={isGhosted
		? 'none'
		: fullscreenBoxId !== null && box.id !== fullscreenBoxId
			? 'none'
			: !isClickable && selectedBoxId !== box.id
				? 'none'
				: 'auto'}
	style:transform="{zTransform} scale(calc(1 + var(--z-brightness, 0) * 0.5))"
	style:position={isPinned ? 'fixed' : 'absolute'}
	style:left={isPinned ? '40px' : `${box.x}px`}
	style:top={isPinned ? '40px' : `${box.y}px`}
>
	<div class="flip-inner">
		<!-- FRONT: Node content -->
		<div class="flip-front">
			<div class="node-toolbar !gap-0 !px-0">
				<div class="node-icon h-5 w-5 !opacity-50">{@render nodeIcon({ class: 'h-5 w-5' })}</div>
				<input
					type="text"
					class="node-title-input"
					placeholder="Untitled Node"
					use:inputAutoWidth={{ minWidth: 40, maxWidth: 380 }}
					style:opacity={nodeTitle ? 1 : 0.5}
					value={nodeTitle || ''}
					oninput={(e) => {
						const input = e.target as HTMLInputElement;
						let newContent: any = {};
						if (box.content && typeof box.content === 'object' && !Array.isArray(box.content)) {
							newContent = Object.assign({}, box.content, { title: input.value });
						} else {
							newContent = { title: input.value, body: box.content };
						}
						canvasStore.updateBox(box.id, { content: newContent });
					}}
				/>
				<TagList
					tags={box.tags || []}
					on:add={(e) => {
						console.log('addTag', e.detail.tag);
						addTag(e.detail.tag);
					}}
					on:remove={(e) => {
						console.log('removeTag', e.detail.tag);
						removeTag(e.detail.tag);
					}}
				/>
				<button class="node-close" title="Close" aria-label="Delete node" onclick={handleClose}>
					<X class="h-5 w-5" />
				</button>
			</div>
			<Component
				id={box.id}
				content={box.content}
				color={box.color}
				isSelected={selectedBoxId === box.id}
				isFullscreen={fullscreenBoxId === box.id}
				isFocused={zoomedBoxId === box.id}
			/>

			<!-- Drag Handle (always visible but subtle) -->
			{#if !fullscreenBoxId}
				<div
					role="button"
					class="drag-handle"
					onpointerdown={handleDragStart}
					title="Drag to move"
					aria-label="Drag to move node"
				></div>
			{/if}

			{#if selectedBoxId === box.id && fullscreenBoxId !== box.id}
				<div
					class="resize-handle handle-se"
					role="button"
					tabindex="0"
					data-handle-type="se"
					data-cursor="resize"
					use:boxResizing={box.id}
					onkeydown={(e) => e.stopPropagation()}
					title="Resize"
					aria-label="Resize node"
				>
					<svg
						width="16"
						height="17"
						viewBox="0 0 16 17"
						xmlns="http://www.w3.org/2000/svg"
						style="display: block;"
					>
						<path
							d="M2 14.8491C6.5 14.8491 14.7818 12.5626 13.9391 2"
							stroke="white"
							stroke-width="3"
							stroke-linecap="round"
							fill="none"
						/>
					</svg>
				</div>
			{/if}
			{#if isPinned}
				<div class="pinned-indicator" title="Pinned">📌</div>
			{/if}
		</div>
		<!-- BACK: Settings/properties -->
		<div class="flip-back !overflow-auto">
			<div class="settings-header">
				<button
					class="node-close back-arrow"
					title="Back"
					aria-label="Back to node"
					onclick={handleBackFromSettings}
				>
					<ArrowDown class="h-5 w-5" style="transform: rotate(90deg);" />
				</button>
				<span>Node Properties</span>
			</div>
			<div class="settings-content">
				<div><b>Type:</b> {box.type}</div>
				<div><b>ID:</b> {box.id}</div>
				<div><b>Properties:</b></div>
				<pre>{JSON.stringify(box.content, null, 2)}</pre>
			</div>
		</div>
	</div>
</div>

<style>
	.toolbar {
		width: 100%;
		height: 100%;
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 10;
	}
	.box {
		position: absolute;
		box-sizing: border-box;
		user-select: none;
		pointer-events: auto;
		border: 1px solid var(--box-border-color);
		border-radius: 10px;
		display: flex;
		padding: 4px;
		cursor: pointer;
		overflow: visible;
		flex-direction: column;
		background-color: var(--handle-bg-color);
		/* Add performance optimizations for smooth transforms */
		will-change: transform, opacity, filter;
		transform-style: preserve-3d;
		backface-visibility: hidden;
		/* Add transitions for smooth visual changes including Z-axis depth effects */
		transition:
			border-color 0.2s ease-out,
			box-shadow 0.2s ease-out,
			filter 0.3s ease-out,
			transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
		/* Add subtle visual effects based on Z-index for depth perception */
		filter: brightness(calc(1 + var(--z-brightness, 0)));
		/* Subtle scale effect based on Z-depth for enhanced depth perception */
		transform: scale(calc(1 + var(--z-brightness, 0) * 0.5));
		/* Dynamic depth shadow that grows with Z-index (background = larger shadow) */
		box-shadow:
			0 0 0 1px var(--box-border-color),
			0 calc(2px + var(--z-brightness, 0) * -10px) calc(8px + var(--z-brightness, 0) * -20px)
				rgba(0, 0, 0, calc(0.1 + var(--z-brightness, 0) * -0.05));
		min-width: 360px;
		min-height: 270px;
		perspective: 1200px;
	}
	.drag-handle {
		position: absolute;
		bottom: -24px !important;
		left: 50%;
		transform: translateX(-50%);
		width: 80px;
		height: 18px !important;
		cursor: move;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 15;
		opacity: 0.7;
		transition: all 0.2s ease;
	}

	.drag-handle::before {
		content: '';
		position: absolute;
		width: 60px;
		height: 3px;
		background-color: #fff;
		border-radius: 3px;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.drag-handle:hover {
		opacity: 1;
	}

	.close-button {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 2px;
		width: 16px;
		transform: translate(0px, -2px);
		height: 24px;
		aspect-ratio: 1/1;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.8;
		transition:
			opacity 0.2s ease,
			background-color 0.2s ease;
		color: var(--text-color, #444);
	}

	.close-button:hover {
		opacity: 1;
		/* background-color: rgba(255, 0, 0, 0.1); */
		/* color: #ff4444; */
	}
	/* Single corner resize handle (bottom-right) - custom SVG style */
	.resize-handle.handle-se {
		position: absolute;
		bottom: -24px;
		right: -24px;
		cursor: nwse-resize;
		width: 32px;
		height: 36px;
		border-radius: 6px;
		z-index: 15;
		opacity: 0.7;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		transform: scale(1.3);
		padding: 4px;
	}

	.resize-handle.handle-se:hover {
		opacity: 1;
		background: rgba(80, 80, 80, 0);
	}

	.resize-handle.handle-se svg {
		display: block;
		width: 16px;
		height: 17px;
		pointer-events: none;
	}
	.box.selected {
		border: 2px solid var(--box-selected-border-color);
		/* Enhanced selected state that preserves depth shadow */
		box-shadow:
			0 0 0 2px var(--box-bg-color-selected-shadow),
			0 calc(2px + var(--z-brightness, 0) * -10px) calc(8px + var(--z-brightness, 0) * -20px)
				rgba(0, 0, 0, calc(0.15 + var(--z-brightness, 0) * -0.05));
	}
	.box.fullscreen {
		border-radius: 8px 8px 0 0;
	}

	.box.quick-focus-active {
		/* Enhanced focus state that preserves depth shadow */
		box-shadow:
			0 0 0 4px var(--quickfocus-indicator-color),
			0 calc(2px + var(--z-brightness, 0) * -10px) calc(8px + var(--z-brightness, 0) * -20px)
				rgba(0, 0, 0, calc(0.15 + var(--z-brightness, 0) * -0.05));
	}

	.fullscreen-toggle-button {
		position: absolute;
		top: 1px;
		right: 1px;
		padding: 0px 3px;
		font-size: 10px;
		line-height: 1;
		height: calc(100% - 4px);
		background-color: var(--handle-button-bg);
		color: var(--handle-text-color);
		border: none;
		border-radius: 2px;
		cursor: pointer;
		z-index: 5;
	}
	.fullscreen-toggle-button:hover {
		background-color: var(--handle-button-hover-bg);
	}

	.box.fullscreen-transition {
		transition: all var(--focus-transition-duration) cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	/* Z-Index Indicator Styles */
	.z-indicator {
		position: absolute;
		top: 2px;
		left: 6px;
		font-size: 10px;
		font-weight: 600;
		color: var(--handle-text-color);
		background: rgba(0, 0, 0, 0.2);
		padding: 2px 6px;
		border-radius: 4px;
		font-family: monospace;
		user-select: none;
		z-index: 2;
		/* Enhanced smooth transitions for Z-axis changes */
		transition:
			background-color 0.3s ease-out,
			border-color 0.3s ease-out,
			color 0.3s ease-out,
			transform 0.3s ease-out,
			box-shadow 0.3s ease-out;
	}

	.z-indicator.background {
		background: rgba(100, 150, 255, 0.3); /* Blue tint for background layers */
		color: #ffffff;
		border: 1px solid rgba(100, 150, 255, 0.5);
	}

	.z-indicator.foreground {
		background: rgba(255, 200, 100, 0.3); /* Orange tint for foreground layers */
		color: #ffffff;
		border: 1px solid rgba(255, 200, 100, 0.5);
	}

	.depth-effects {
		font-size: 8px;
		opacity: 0.8;
		font-weight: normal;
		margin-left: 4px;
	}

	/* Ghosted node styles - completely transparent and non-interactive */
	.box.ghosted {
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease-out;
	}

	/* Non-clickable nodes - out of focus foreground nodes that you can click through */
	.box.non-clickable {
		cursor: default;
		/* Subtle visual hint that the node is non-interactive */
		filter: brightness(0.9) contrast(0.8);
	}

	.box.non-clickable:hover {
		/* Remove hover effects for non-clickable nodes */
		filter: brightness(0.9) contrast(0.8);
	}

	/* Edit mode - node is focused and ready for content interaction */
	.box.edit-mode {
		/* Subtle visual indication that the node is in edit mode */
		border-color: rgba(74, 144, 226, 0.6);
		box-shadow:
			0 0 0 2px rgba(74, 144, 226, 0.3),
			0 calc(2px + var(--z-brightness, 0) * -10px) calc(8px + var(--z-brightness, 0) * -20px)
				rgba(0, 0, 0, calc(0.1 + var(--z-brightness, 0) * -0.05));
	}

	.box.edit-mode .drag-handle {
		/* TODO Make this a floating toolbar: */
	}

	/* Change cursor for content area when in edit mode */
	.box.edit-mode {
		cursor: text; /* Indicate that content can be edited */
	}

	.box.edit-mode .drag-handle {
		cursor: move; /* Keep move cursor for drag handle */
	}

	/* Boundary hit animation - red flash with springy bounce when hitting Z=0 boundary */
	.box.boundary-hit {
		border-color: #ff4444 !important;
		/* Preserve depth shadow while adding boundary hit effect */
		box-shadow:
			0 0 0 4px rgba(255, 68, 68, 0.5),
			0 0 20px rgba(255, 68, 68, 0.3),
			0 calc(2px + var(--z-brightness, 0) * -10px) calc(8px + var(--z-brightness, 0) * -20px)
				rgba(0, 0, 0, calc(0.15 + var(--z-brightness, 0) * -0.05)) !important;
		animation:
			boundary-flash 0.5s ease-out,
			boundary-spring 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}

	@keyframes boundary-flash {
		0% {
			border-color: #ff4444;
			box-shadow:
				0 0 0 4px rgba(255, 68, 68, 0.8),
				0 0 30px rgba(255, 68, 68, 0.6);
		}
		50% {
			border-color: #ff6666;
			box-shadow:
				0 0 0 6px rgba(255, 68, 68, 0.6),
				0 0 25px rgba(255, 68, 68, 0.4);
		}
		100% {
			border-color: var(--box-border-color);
			box-shadow: none;
		}
	}

	@keyframes boundary-spring {
		0% {
			transform: scale(calc((1 + var(--z-brightness, 0) * 0.5) * 1)) translateZ(0);
		}
		15% {
			transform: scale(calc((1 + var(--z-brightness, 0) * 0.5) * 0.95)) translateZ(0);
		}
		30% {
			transform: scale(calc((1 + var(--z-brightness, 0) * 0.5) * 1.05)) translateZ(0);
		}
		45% {
			transform: scale(calc((1 + var(--z-brightness, 0) * 0.5) * 0.98)) translateZ(0);
		}
		60% {
			transform: scale(calc((1 + var(--z-brightness, 0) * 0.5) * 1.02)) translateZ(0);
		}
		75% {
			transform: scale(calc((1 + var(--z-brightness, 0) * 0.5) * 0.99)) translateZ(0);
		}
		100% {
			transform: scale(calc(1 + var(--z-brightness, 0) * 0.5)) translateZ(0);
		}
	}

	/* Minimalist Node Toolbar/Header Styles */
	.node-toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 36px;
		background: rgba(24, 24, 24, 0);
		position: absolute;
		top: -48px;
		left: 0;
		right: 0;
		border-radius: 10px 10px 0 0;
		padding: 0 8px 0 8px;
		z-index: 20;
		user-select: none;
		font-size: 16px;
		font-weight: 500;
		color: #ffffff;
		box-sizing: border-box;
		pointer-events: auto;
		border-bottom: 1.5px solid rgba(255, 255, 255, 0.08);
	}
	.node-icon {
		font-size: 22px;
		margin-right: 8px;
		margin-left: 2px;
		opacity: 0.92;
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
	.node-title {
		flex: 1 1 auto;
		font-size: 12px;
		font-weight: 400;
		color: #eaeaea;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		opacity: 0.97;
		display: flex;
		align-items: center;
		letter-spacing: 0.01em;
	}

	.node-title-input {
		background: none;
		border: none;
		outline: none;
		color: #eaeaea;
		font-size: 12px;
		font-weight: 400;
		padding: 2px 6px;
		margin-right: 8px;
		border-radius: 4px;
		flex: 1 1 auto;
		white-space: nowrap;
		outline: none !important;
		box-shadow: none !important;
		box-sizing: border-box;
		overflow: hidden;
		text-overflow: ellipsis;
		opacity: 1;
	}

	.node-title-input::placeholder {
		color: #eaeaea;
		opacity: 0.5;
	}
	.node-close {
		background: none;
		border: none;
		color: #eaeaea;
		font-size: 24px;
		cursor: pointer;
		/* opacity: 0.7; */
		margin-left: 12px;
		border-radius: 50%;
		padding: 0;
		width: 32px;
		transform: translateY(-2px);
		height: 32px;
		transition:
			background 0.15s,
			opacity 0.15s;
		align-self: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.node-close:hover {
		background: rgba(255, 255, 255, 0.13);
		color: cyan;
	}

	.flip-inner {
		position: relative;
		width: 100%;
		height: 100%;
		transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
		transform-style: preserve-3d;
	}
	.box.flipped .flip-inner {
		transform: rotateY(180deg);
	}
	.flip-front,
	.flip-back {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		backface-visibility: hidden;
		border-radius: inherit;
		background: inherit;
		box-sizing: border-box;
		z-index: 1;
	}
	.flip-front {
		z-index: 2;
	}
	.flip-back {
		transform: rotateY(180deg);
		background: #232b2b;
		color: #eaeaea;
		padding: 32px 24px 24px 24px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-start;
		font-size: 14px;
		z-index: 3;
	}
	.settings-header {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 12px;
		gap: 8px;
	}
	.settings-content {
		width: 100%;
		font-size: 13px;
		line-height: 1.5;
		word-break: break-all;
	}
	.pinned-indicator {
		position: absolute;
		top: 8px;
		right: 8px;
		font-size: 22px;
		pointer-events: none;
		z-index: 30;
	}
	.pin-btn svg {
		stroke: gold;
	}
	.box.pinned {
		box-shadow:
			0 0 0 3px gold,
			0 2px 8px rgba(0, 0, 0, 0.2);
		border-color: gold;
	}
	.back-arrow {
		margin-right: 10px;
	}
</style>
