<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { zoom, offsetX, offsetY } from '$lib/stores/viewportStore';
	import { get, derived } from 'svelte/store';

	const WIDTH = 200;
	const HEIGHT = 140;

	// Reactive values
	const boxes = $derived(canvasStore.boxes);
	const selectedBoxId = $derived(canvasStore.selectedBoxId);

	// World bounds and transform stored in state vars
	let bounds = $state({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
	let transform = $state({ scale: 1, offsetX: 0, offsetY: 0 });
	let viewRect = $state({ x: 0, y: 0, w: 0, h: 0 });

	const padding = 20;

	$effect(() => {
		// Recompute bounds and transform whenever the set of boxes changes.
		if (boxes.length === 0) return;

		// Compute fresh bounds from the boxes **without** referencing the existing
		// `bounds` object so that this effect only depends on `boxes`.
		const newBounds = {
			minX: Math.min(...boxes.map((b) => b.x)),
			minY: Math.min(...boxes.map((b) => b.y)),
			maxX: Math.max(...boxes.map((b) => b.x + b.width)),
			maxY: Math.max(...boxes.map((b) => b.y + b.height))
		};

		const worldW = newBounds.maxX - newBounds.minX;
		const worldH = newBounds.maxY - newBounds.minY;
		const scale = Math.min((WIDTH - padding) / worldW, (HEIGHT - padding) / worldH);

		// Update the component state.
		bounds = newBounds;
		transform = {
			scale,
			offsetX: -newBounds.minX * scale + (WIDTH - worldW * scale) / 2,
			offsetY: -newBounds.minY * scale + (HEIGHT - worldH * scale) / 2
		};
	});

	$effect(() => {
		// Make this effect reactive to viewport changes by referencing the
		// `zoom`, `offsetX`, and `offsetY` stores directly (via the $ prefix).
		// We also reference `transform` so the rectangle recalculates when its
		// scale/offset update after a boxes change.
		const currentZ = $zoom;
		const ox = $offsetX;
		const oy = $offsetY;

		viewRect = {
			x: (-ox / currentZ) * transform.scale + transform.offsetX,
			y: (-oy / currentZ) * transform.scale + transform.offsetY,
			w: (innerWidth / currentZ) * transform.scale,
			h: (innerHeight / currentZ) * transform.scale
		};
	});

	// Handle click to pan
	function handleClick(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const localX = e.clientX - rect.left;
		const localY = e.clientY - rect.top;
		const t = transform;
		const worldX = (localX - t.offsetX) / t.scale;
		const worldY = (localY - t.offsetY) / t.scale;

		const newOffsetX = innerWidth / 2 - worldX * get(zoom);
		const newOffsetY = innerHeight / 2 - worldY * get(zoom);

		offsetX.set(newOffsetX);
		offsetY.set(newOffsetY);
	}

	// --- Drag-to-pan support ---
	let isDragging = false;

	function worldCoordsFromEvent(e: PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const localX = e.clientX - rect.left;
		const localY = e.clientY - rect.top;
		const t = transform;
		const worldX = (localX - t.offsetX) / t.scale;
		const worldY = (localY - t.offsetY) / t.scale;
		return { worldX, worldY };
	}

	function centerViewportOn(worldX: number, worldY: number) {
		const currentZ = get(zoom);
		const newOffsetX = innerWidth / 2 - worldX * currentZ;
		const newOffsetY = innerHeight / 2 - worldY * currentZ;
		offsetX.set(newOffsetX);
		offsetY.set(newOffsetY);
	}

	function handlePointerDown(e: PointerEvent) {
		isDragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const { worldX, worldY } = worldCoordsFromEvent(e);
		centerViewportOn(worldX, worldY);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		const { worldX, worldY } = worldCoordsFromEvent(e);
		centerViewportOn(worldX, worldY);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}
</script>

<div
	class="minimap"
	style="width:{WIDTH}px;height:{HEIGHT}px"
	on:click={handleClick}
	on:pointerdown={handlePointerDown}
	on:pointermove={handlePointerMove}
	on:pointerup={handlePointerUp}
	on:pointerleave={handlePointerUp}
>
	{#each boxes as b (b.id)}
		<div
			class="box"
			style="left:{b.x * transform.scale + transform.offsetX}px;top:{b.y * transform.scale +
				transform.offsetY}px;width:{b.width * transform.scale}px;height:{b.height *
				transform.scale}px;opacity:{b.id === selectedBoxId ? 0.9 : 0.3}"
		></div>
	{/each}
	<div
		class="viewport"
		style="left:{viewRect.x}px;top:{viewRect.y}px;width:{viewRect.w}px;height:{viewRect.h}px"
	></div>
</div>

<style>
	.minimap {
		position: absolute;
		right: 16px;
		bottom: 16px;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		overflow: hidden;
		pointer-events: auto;
		z-index: 9999;
	}
	.viewport {
		position: absolute;
		border: 1px solid #fff;
		box-shadow: 0 0 0 1px #000;
	}
	.box {
		position: absolute;
		background: rgba(255, 255, 255, 0.5);
	}
</style>
