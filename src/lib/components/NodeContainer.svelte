<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { canvasStore } from '$lib/stores/canvasStore';
	import { boxDragging } from '$lib/interactions/boxDragging';
	import { boxResizing } from '$lib/interactions/boxResizing';
	import type { AppBoxState } from '$lib/canvasState';
	import { nodeComponentMap } from '$lib/components/nodeComponentMap';
	import { getViewportContext } from '$lib/contexts/viewportContext';

	export let box: AppBoxState;

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

	let selectedBoxId: number | null;
	let fullscreenBoxId: number | null;
	let zoomedBoxId: number | null; // Track zoomed state
	let isAnimatingFullscreen: boolean;
	let lastSelectedBoxId: number | null;
	let currentZoom: number; // Need current zoom level
	// Subscribe only in browser/onMount if needed, but safe here
	const unsubscribe = canvasStore.subscribe((state) => {
		selectedBoxId = state.selectedBoxId;
		fullscreenBoxId = state.fullscreenBoxId;
		zoomedBoxId = state.zoomedBoxId;
		currentZoom = state.zoom; // Get zoom level
		isAnimatingFullscreen = state.isAnimatingFullscreen;
		lastSelectedBoxId = state.lastSelectedBoxId;
	});
	onDestroy(unsubscribe);

	const Component = nodeComponentMap[box.type] || nodeComponentMap['sticky'];

	function handleClick(event: MouseEvent) {
		// Always select the clicked box first
		canvasStore.selectBox(box.id);

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
			canvasStore.restorePreviousView();
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
</style>
