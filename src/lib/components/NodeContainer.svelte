<script lang="ts">
	import { onMount } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { boxResizing } from '$lib/interactions/boxResizing.svelte';
	import { nodeComponentMap } from '$lib/components/nodeComponentMap';
	import { getViewportContext } from '$lib/contexts/viewportContext';
	import { FOCUS_TRANSITION_DURATION } from '$lib/constants';
	import { isNodeClickable } from '$lib/utils/depth';
	import { getFocusZoomForZ } from '$lib/utils/depth';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenuStore.svelte';
	import type { AppBoxState } from '$lib/canvasState';

	// Icons
	import {
		X,
		File,
		Clapperboard,
		AudioLines,
		Table,
		StickyNote,
		Globe,
		Image,
		Code
	} from 'lucide-svelte';

	// Icon mapping for node types
	const nodeTypeIcons: Record<string, any> = {
		sticky: StickyNote,
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

	// Compute node title (fallback to type if no content)
	const nodeTitle = box.content?.split('\n')[0]?.slice(0, 32) || 'Untitled';
	const nodeIcon = nodeTypeIcons[box.type] || nodeTypeIcons.default;

	// 3D transform for z layer
	const depthFactor = 60; // px per z layer
	const zTransform = `perspective(800px) translateZ(${box.z * depthFactor}px) rotateX(${box.z * -2}deg) rotateY(${box.z * 1.5}deg)`;

	function handleClick(event: MouseEvent) {
		console.log(`[NodeContainer] Clicked box id: ${box.id}`, box);

		// Check if this box is already selected and zoomed (focused)
		const isAlreadyFocused =
			selectedBoxId === box.id && zoomedBoxId === box.id && currentZoom >= focusZoom * 0.95; // add tolerance

		if (isAlreadyFocused) {
			// If already focused, don't zoom - just allow interaction with content
			console.log(`[NodeContainer] Box ${box.id} already focused, allowing content interaction`);
			return;
		}

		// Always select the box first
		canvasStore.selectBox(box.id);

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
		canvasStore.restorePreviousZoom();
	}

	function handleRightClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Generate context menu items based on node state
		const items: ContextMenuItem[] = [
			{
				id: 'focus',
				label: 'Focus Node',
				icon: '🎯',
				disabled: selectedBoxId === box.id && zoomedBoxId === box.id
			},
			{
				id: 'duplicate',
				label: 'Duplicate',
				icon: '📋'
			},
			{ id: 'sep1', label: '', separator: true },
			{
				id: 'bring-forward',
				label: 'Bring Forward',
				icon: '⬆️'
			},
			{
				id: 'send-backward',
				label: 'Send Backward',
				icon: '⬇️'
			},
			{ id: 'sep2', label: '', separator: true },
			{
				id: 'delete',
				label: 'Delete',
				icon: '🗑️'
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
</script>

<div
	class="box"
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
	style:left="{box.x}px"
	style:top="{box.y}px"
	style:width="{Math.max(box.width, 360)}px"
	style:height="{Math.max(box.height, 360)}px"
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
			: !isClickable
				? 'none'
				: 'auto'}
	style:transform="{zTransform} scale(calc(1 + var(--z-brightness, 0) * 0.5))"
>
	<!-- Minimalist Node Toolbar/Header -->
	<div class="node-toolbar">
		{@render nodeIcon({ class: 'node-icon' })}
		<input
			type="text"
			class="node-title-input"
			placeholder="Untitled Node"
			style="
				background: none;
				border: none;
				outline: none;
				color: #eaeaea;
				font-size: 12px;
				font-weight: 400;
				padding: 2px 6px;
				margin: 0;
				border-radius: 4px;
				width: auto;
				flex: 1 1 auto;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				opacity: 1;
			"
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
		<button class="node-close" title="Close" aria-label="Delete node" onclick={handleClose}
			><X /></button
		>
	</div>

	<!-- Node-specific content -->
	<Component
		id={box.id}
		content={box.content}
		color={box.color}
		isSelected={selectedBoxId === box.id}
		isFullscreen={fullscreenBoxId === box.id}
		isFocused={zoomedBoxId === box.id}
	/>

	{#if selectedBoxId === box.id && fullscreenBoxId !== box.id}
		<!-- Single corner resize handle (bottom-right) -->
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
			<!-- Resize handle icon -->
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
</div>

<style>
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
		min-height: 360px;
	}
	.drag-handle {
		width: 100%;
		height: var(--handle-height);
		background-color: var(--handle-bg-color);
		cursor: move;
		flex-shrink: 0;
		border-radius: 8px 8px 0px 0px;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 8px;
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
		background-color: rgba(255, 0, 0, 0.1);
		color: #ff4444;
	}
	/* Single corner resize handle (bottom-right) - custom SVG style */
	.resize-handle.handle-se {
		position: absolute;
		bottom: -24px;
		right: -24px;
		cursor: nwse-resize;
		width: 32px;
		height: 36px;
		/* background: rgba(60, 60, 60, 0.9); */
		/* border: 1px solid rgba(120, 120, 120, 0.8); */
		border-radius: 6px;
		/* box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); */
		z-index: 15;
		opacity: 0.9;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		padding: 4px;
	}

	.resize-handle.handle-se:hover {
		opacity: 1;
		background: rgba(80, 80, 80, 0);
		transform: scale(1.3);
		/* box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); */
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
		height: 38px;
		background: rgba(24, 24, 24, 0);
		position: absolute;
		top: -48px;
		left: 0;
		right: 0;
		border-radius: 10px 10px 0 0;
		padding: 0 8px 0 8px;
		z-index: 20;
		user-select: none;
		font-size: 17px;
		font-weight: 500;
		color: #eaeaea;
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
		font-size: 12px;
		outline: none;
		border: none;
		background: none;
		color: #eaeaea;
		opacity: 1;
		flex: 1 1 auto;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
		opacity: 0.7;
		margin-left: 12px;
		border-radius: 4px;
		padding: 0 8px;
		transition:
			background 0.15s,
			opacity 0.15s;
		align-self: center;
		display: flex;
		align-items: center;
		height: 42px;
	}
	.node-close:hover {
		background: rgba(255, 0, 0, 0.13);
		color: cyan;
	}
</style>
