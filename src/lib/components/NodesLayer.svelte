<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { AppBoxState } from '$lib/canvasState';
	import { canvasStore } from '$lib/stores/canvasStore';
	import NodeContainer from './NodeContainer.svelte';

	let zoom: number;
	let offsetX: number;
	let offsetY: number;
	let boxes: AppBoxState[];

	const unsubscribe = canvasStore.subscribe((state) => {
		zoom = state.zoom;
		offsetX = state.offsetX;
		offsetY = state.offsetY;
		boxes = state.boxes;
	});
	onDestroy(unsubscribe);

	// Compute CSS transform for world positioning
	$: worldTransform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
</script>

<div class="world" style:transform={worldTransform}>
	{#each boxes as box (box.id)}
		<NodeContainer {box} />
	{/each}
</div>

<style>
	.world {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		transform-origin: 0 0;
		pointer-events: none;
	}
</style>
