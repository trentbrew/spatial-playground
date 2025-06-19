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
	role="button"
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
			: !isClickable
				? 'none'
				: 'auto'}
>
	<!-- Drag handle placeholder -->
	<!-- <div
		class="drag-handle"
		role="button"
		tabindex="0"
		title="Drag to move"
		data-cursor="grab"
		onclick={(e) => e.stopPropagation()}
		ondblclick={handleDragHandleDoubleClick}
		onkeydown={handleDragHandleKeyDown}
	>
		<button
			class="close-button"
			data-cursor="close-button"
			onclick={handleClose}
			title="Close"
			aria-label="Close node"
		>
			×
		</button>
	</div> -->

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
			<svg
				width="16"
				height="17"
				viewBox="0 0 16 17"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M2 14.8491C6.5 14.8491 14.7818 12.5626 13.9391 2"
					stroke="white"
					stroke-width="3"
					stroke-linecap="round"
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
		transform: translateY(-2px);
		height: 16px;
		aspect-ratio: 1/1;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.6;
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
		bottom: -18px;
		right: -20px;
		cursor: nwse-resize;
		width: 24px;
		height: 24px;
		background: rgba(40, 40, 40, 0);
		border: none;
		border-radius: 8px;
		/* box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); */
		z-index: 15;
		opacity: 0.5;
		pointer-events: auto;
		display: flex;
		align-items: center;
		transition: 300ms !important;
		justify-content: center;
		padding: 4px;
	}

	.resize-handle.handle-se:hover {
		opacity: 1;
		bottom: -22px;
		right: -24px;
	}

	.resize-handle.handle-se svg {
		display: block;
		/* transform: translate(16px, 14px); */
		width: 16px;
		height: 24px;
		pointer-events: none;
	}

	/* Hover effect for custom SVG handle */
	/* .resize-handle.handle-se:hover {
		opacity: 1;
		background-color: rgba(60, 60, 60, 0.95);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	} */
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
</style>
