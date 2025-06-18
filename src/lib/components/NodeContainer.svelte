<script lang="ts">
	import { onMount } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { boxDragging } from '$lib/interactions/boxDragging';
	import { boxResizing } from '$lib/interactions/boxResizing';
	import type { AppBoxState } from '$lib/canvasState';
	import { nodeComponentMap } from '$lib/components/nodeComponentMap';
	import { getViewportContext } from '$lib/contexts/viewportContext';
	import { FOCUS_TRANSITION_DURATION } from '$lib/constants';

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

	// Component references for actions
	let containerElement: HTMLDivElement;
	let dragHandleElement: HTMLDivElement;

	function handleClick(event: MouseEvent) {
		console.log(`[NodeContainer] Clicked box id: ${box.id}`, box);

		// Start animation tracing automatically
		if (typeof window !== 'undefined' && window.animationTracer) {
			console.log('🔍 Auto-starting animation trace for click...');
			window.animationTracer.traceZoomToBox(box.id, viewportWidth, viewportHeight);
		} else {
			// Fallback to manual zoom if tracer not available
			console.log('⚠️ Animation tracer not available, using manual zoom');
			// Always select the box first
			canvasStore.selectBox(box.id);
			// Then, trigger the zoom-to-focus animation
			canvasStore.zoomToBox(box.id, viewportWidth, viewportHeight);
		}
	}

	function handleDoubleClick(event: MouseEvent) {
		// A double click will now restore the previous zoom level (zoom out)
		canvasStore.restorePreviousZoom();
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
</script>

<div
	class="box"
	role="button"
	tabindex="0"
	onclick={handleClick}
	ondblclick={handleDoubleClick}
	onkeydown={handleKeyDown}
	class:selected={selectedBoxId === box.id}
	class:fullscreen={fullscreenBoxId === box.id}
	class:fullscreen-transition={isAnimatingFullscreen && fullscreenBoxId === box.id}
	class:quick-focus-active={zoomedBoxId === box.id && currentZoom > 1.0}
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
	style:pointer-events={fullscreenBoxId !== null && box.id !== fullscreenBoxId ? 'none' : 'auto'}
>
	<!-- Drag handle placeholder -->
	<div
		class="drag-handle"
		role="button"
		tabindex="0"
		title="Drag to move"
		use:boxDragging={box.id}
		ondblclick={handleDragHandleDoubleClick}
		onkeydown={handleDragHandleKeyDown}
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
			onclick={toggleFullscreen}
			ondblclick={(e) => e.stopPropagation()}
		>
			{#if fullscreenBoxId === box.id}Exit{:else}Full{/if}
		</button>
	</div>

	<!-- Node-specific content -->
	<Component
		id={box.id}
		content={box.content}
		color={box.color}
		isSelected={selectedBoxId === box.id}
		isFullscreen={fullscreenBoxId === box.id}
	/>

	{#if selectedBoxId === box.id && fullscreenBoxId !== box.id}
		<!-- Resize Handles -->
		<div
			class="resize-handle handle-n"
			role="button"
			tabindex="0"
			data-handle-type="n"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-ne"
			role="button"
			tabindex="0"
			data-handle-type="ne"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-e"
			role="button"
			tabindex="0"
			data-handle-type="e"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-se"
			role="button"
			tabindex="0"
			data-handle-type="se"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-s"
			role="button"
			tabindex="0"
			data-handle-type="s"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-sw"
			role="button"
			tabindex="0"
			data-handle-type="sw"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-w"
			role="button"
			tabindex="0"
			data-handle-type="w"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
		<div
			class="resize-handle handle-nw"
			role="button"
			tabindex="0"
			data-handle-type="nw"
			use:boxResizing={box.id}
			onkeydown={(e) => e.stopPropagation()}
		></div>
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
		/* Match duration and easing with the focus transition */
		transition:
			width var(--focus-transition-duration) ease-in-out,
			height var(--focus-transition-duration) ease-in-out,
			left var(--focus-transition-duration) ease-in-out,
			top var(--focus-transition-duration) ease-in-out;
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
