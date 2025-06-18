<script lang="ts">
	import { onMount } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { boxDragging } from '$lib/interactions/boxDragging';
	import { boxResizing } from '$lib/interactions/boxResizing';
	import type { AppBoxState } from '$lib/canvasState';
	import { nodeComponentMap } from '$lib/components/nodeComponentMap';
	import { getViewportContext } from '$lib/contexts/viewportContext';

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

	const Component = nodeComponentMap[box.type] || nodeComponentMap['sticky'];

	// Derived state for styling and positioning
	const isSelected = $derived(selectedBoxId === box.id);
	const isFullscreen = $derived(fullscreenBoxId === box.id);
	const zIndex = $derived(lastSelectedBoxId === box.id ? 1000 : 100);
	const worldTransform = $derived(`translate(${box.x}px, ${box.y}px)`);

	// Toolbar positioning - calculate screen position to avoid scaling issues
	const toolbarPosition = $derived(() => {
		const zoom = currentZoom;
		const offsetX = canvasStore.offsetX;
		const offsetY = canvasStore.offsetY;

		// Calculate screen position of the box center
		const boxCenterScreenX = (box.x + box.width / 2) * zoom + offsetX;
		const boxTopScreenY = box.y * zoom + offsetY;

		return {
			// Position in screen coordinates
			left: boxCenterScreenX,
			top: boxTopScreenY - 50, // 50px above the box in screen space
			scale: 1 // No scaling needed since we're using screen coordinates
		};
	});

	// Component references for actions
	let containerElement: HTMLDivElement;
	let dragHandleElement: HTMLDivElement;

	function handleClick(event: MouseEvent) {
		// Always select the clicked box first, providing viewport dimensions
		canvasStore.selectBox(box.id, viewportWidth, viewportHeight);

		// If already zoomed in (via double-click) on a DIFFERENT box,
		// treat this single click as a request to zoom to the new box.
		if (zoomedBoxId !== null && zoomedBoxId !== box.id && currentZoom > 1.0) {
			canvasStore.zoomToBox(box.id, viewportWidth, viewportHeight);
		}
	}

	function handleDoubleClick(event: MouseEvent) {
		if (fullscreenBoxId === box.id) {
			// Do nothing if already fullscreen - exit is handled by the button
			return;
		} else if (zoomedBoxId === box.id) {
			canvasStore.restorePreviousZoom();
		} else {
			// Exit fullscreen if another box is fullscreen first
			if (fullscreenBoxId !== null) {
				canvasStore.exitFullscreen();
				// TODO: Potentially wait for exit animation?
				// For now, zooming immediately after might be slightly jarring
				setTimeout(() => canvasStore.zoomToBox(box.id, viewportWidth, viewportHeight), 50);
			} else {
				canvasStore.zoomToBox(box.id, viewportWidth, viewportHeight);
			}
		}
	}

	// New handler for double-clicking the drag handle area
	function handleDragHandleDoubleClick(event: MouseEvent) {
		if (fullscreenBoxId === box.id) {
			// Exit fullscreen if the double-click is on the handle (but not the button itself,
			// as the button's own dblclick stops propagation)
			event.stopPropagation(); // Prevent multiClick on parent .box from firing
			canvasStore.exitFullscreen();
		}
		// If not fullscreen, do nothing, let the event bubble if necessary
	}

	function toggleFullscreen(event: MouseEvent) {
		event.stopPropagation(); // Prevent multiClick action
		if (fullscreenBoxId === box.id) {
			canvasStore.exitFullscreen();
		} else {
			canvasStore.enterFullscreen(box.id, viewportWidth, viewportHeight);
		}
	}

	// Toolbar button handlers
	function handleDuplicate(event: MouseEvent) {
		event.stopPropagation();
		// TODO: Implement duplicate functionality
		console.log('Duplicate box:', box.id);
	}

	function handleDelete(event: MouseEvent) {
		event.stopPropagation();
		// TODO: Implement delete functionality
		console.log('Delete box:', box.id);
	}

	function handleSettings(event: MouseEvent) {
		event.stopPropagation();
		// TODO: Implement settings functionality
		console.log('Settings for box:', box.id);
	}
</script>

<div
	class="box"
	on:click={handleClick}
	on:dblclick={handleDoubleClick}
	class:selected={selectedBoxId === box.id}
	class:fullscreen={fullscreenBoxId === box.id}
	class:fullscreen-transition={isAnimatingFullscreen && fullscreenBoxId === box.id}
	class:quick-focus-active={zoomedBoxId === box.id && currentZoom > 1.0}
	style:left="{box.x}px"
	style:top="{box.y}px"
	style:width="{box.width}px"
	style:height="{box.height}px"
	style:--z-brightness={box.z * 0.05}
	style:z-index={fullscreenBoxId === box.id
		? 10
		: selectedBoxId === box.id
			? 7
			: lastSelectedBoxId === box.id
				? 5
				: 1}
	style:pointer-events={fullscreenBoxId !== null && box.id !== fullscreenBoxId ? 'none' : 'auto'}
>
	<!-- Drag handle placeholder -->
	<div
		class="drag-handle"
		title="Drag to move"
		use:boxDragging={box.id}
		on:dblclick={handleDragHandleDoubleClick}
	>
		<!-- Z-index indicator -->
		<div class="z-indicator" class:background={box.z < 0} class:foreground={box.z > 0}>
			Z: {box.z}
			{#if box.z < 0}
				<span class="depth-effects">
					({(1 + box.z * 0.15).toFixed(2)}x, {(Math.abs(box.z) * 1.5).toFixed(1)}px blur)
				</span>
			{/if}
		</div>

		<button
			class="fullscreen-toggle-button"
			on:click={toggleFullscreen}
			on:dblclick|stopPropagation
		>
			{#if fullscreenBoxId === box.id}Exit{:else}Full{/if}
		</button>
	</div>

	<!-- Node-specific content -->
	<svelte:component
		this={Component}
		id={box.id}
		content={box.content}
		color={box.color}
		isSelected={selectedBoxId === box.id}
		isFullscreen={fullscreenBoxId === box.id}
	/>

	{#if selectedBoxId === box.id && fullscreenBoxId !== box.id}
		<!-- Resize Handles -->
		<div class="resize-handle handle-n" data-handle-type="n" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-ne" data-handle-type="ne" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-e" data-handle-type="e" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-se" data-handle-type="se" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-s" data-handle-type="s" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-sw" data-handle-type="sw" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-w" data-handle-type="w" use:boxResizing={box.id}></div>
		<div class="resize-handle handle-nw" data-handle-type="nw" use:boxResizing={box.id}></div>
	{/if}
</div>

<!-- Floating Toolbar -->
{#if selectedBoxId === box.id && fullscreenBoxId !== box.id}
	<div
		class="floating-toolbar"
		style:left="{toolbarPosition().left}px"
		style:top="{toolbarPosition().top}px"
		style:transform="translate(-50%, 0) scale({toolbarPosition().scale})"
		style:z-index={zIndex + 1}
	>
		<button class="toolbar-btn" title="Duplicate" on:click={handleDuplicate}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
			</svg>
		</button>
		<button class="toolbar-btn" title="Delete" on:click={handleDelete}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<polyline points="3,6 5,6 21,6"></polyline>
				<path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"
				></path>
				<line x1="10" y1="11" x2="10" y2="17"></line>
				<line x1="14" y1="11" x2="14" y2="17"></line>
			</svg>
		</button>
		<button class="toolbar-btn" title="Settings" on:click={handleSettings}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="12" cy="12" r="3"></circle>
				<path
					d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
				></path>
			</svg>
		</button>
	</div>
{/if}

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
		/* Add transitions for smooth visual changes */
		transition:
			border-color 0.2s ease-out,
			box-shadow 0.2s ease-out;
		/* Add subtle box-shadow based on Z-index for depth perception */
		filter: brightness(calc(1 + var(--z-brightness, 0)));
	}
	.drag-handle {
		width: 100%;
		height: var(--handle-height);
		background-color: var(--handle-bg-color);
		cursor: move;
		flex-shrink: 0;
		border-radius: 8px 8px 0px 0px;
		position: relative;
	}
	.resize-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background-color: var(--resize-handle-bg);
		border: 1px solid var(--resize-handle-border);
		box-sizing: border-box;
		z-index: 10;
	}
	.handle-nw {
		top: -5px;
		left: -5px;
		cursor: nwse-resize;
	}
	.handle-ne {
		top: -5px;
		right: -5px;
		cursor: nesw-resize;
	}
	.handle-sw {
		bottom: -5px;
		left: -5px;
		cursor: nesw-resize;
	}
	.handle-se {
		bottom: -5px;
		right: -5px;
		cursor: nwse-resize;
	}
	.handle-n {
		top: -5px;
		left: 50%;
		transform: translateX(-50%);
		cursor: ns-resize;
	}
	.handle-s {
		bottom: -5px;
		left: 50%;
		transform: translateX(-50%);
		cursor: ns-resize;
	}
	.handle-w {
		top: 50%;
		left: -5px;
		transform: translateY(-50%);
		cursor: ew-resize;
	}
	.handle-e {
		top: 50%;
		right: -5px;
		transform: translateY(-50%);
		cursor: ew-resize;
	}
	.box.selected {
		border: 2px solid var(--box-selected-border-color);
		box-shadow: 0 0 0 2px var(--box-bg-color-selected-shadow);
	}
	.box.fullscreen {
		border-radius: 8px 8px 0 0;
	}

	.box.quick-focus-active {
		/* Use box-shadow for an outline that doesn't affect layout */
		box-shadow: 0 0 0 4px var(--quickfocus-indicator-color);
		/* Optionally slightly change border too if desired */
		/* border-color: var(--box-selected-border-color); */
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
		/* Match duration and easing with JS TRIPLEZOOM_DURATION - Assume 400ms for now */
		transition:
			width 400ms ease-in-out,
			height 400ms ease-in-out,
			left 400ms ease-in-out,
			top 400ms ease-in-out;
	}

	/* Floating Toolbar Styles */
	.floating-toolbar {
		position: fixed; /* Using fixed positioning for screen-space coordinates */
		display: flex;
		gap: 4px;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
		border-radius: 8px;
		padding: 6px;
		pointer-events: auto;
		transform-origin: center top;
		z-index: 1001;
		opacity: 0;
		animation: fadeInToolbar 0.2s ease-out forwards;
	}

	@keyframes fadeInToolbar {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		color: white;
		cursor: pointer;
		transition: all 0.2s ease;
		padding: 0;
	}

	.toolbar-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.3);
		transform: scale(1.05);
	}

	.toolbar-btn:active {
		transform: scale(0.95);
	}

	.toolbar-btn svg {
		width: 16px;
		height: 16px;
		stroke-width: 2;
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
		transition: all 0.2s ease;
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
</style>
