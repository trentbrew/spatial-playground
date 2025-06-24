<script lang="ts">
	import { Plus, FolderOpen, FilePlus, ZoomIn, ZoomOut, Maximize2 } from 'lucide-svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import {
		createNewGraph,
		switchGraph,
		getGraphIds,
		currentGraphId
	} from '$lib/stores/turtleDbStore';
	import { getViewportCenterInWorld } from '$lib/utils/coordinates';
	import type { AppBoxState } from '$lib/canvasState';

	// Create new graph
	async function handleNewGraph() {
		try {
			await createNewGraph();
			console.log('Created new graph');
		} catch (error) {
			console.error('Failed to create new graph:', error);
		}
	}

	// Switch to previous graph (cycle through available graphs)
	async function handleVisitGraph() {
		try {
			const graphIds = getGraphIds();
			if (graphIds.length <= 1) {
				console.log('No other graphs available');
				return;
			}

			// Get current graph ID and find the next one
			let currentId = '';
			const unsubscribe = currentGraphId.subscribe((id) => (currentId = id));
			unsubscribe(); // Clean up subscription immediately

			const currentIndex = graphIds.indexOf(currentId);
			const nextIndex = (currentIndex + 1) % graphIds.length;
			const nextGraphId = graphIds[nextIndex];

			await switchGraph(nextGraphId);
			console.log(`Switched to graph: ${nextGraphId}`);
		} catch (error) {
			console.error('Failed to switch graph:', error);
		}
	}

	// Create new node at viewport center
	function handleNewNode() {
		try {
			const types = ['sticky', 'code', 'text', 'image', 'embed'];

			// Use consistent dark gray for all nodes
			const defaultColor = '#2a2a2a';
			const randomType = types[Math.floor(Math.random() * types.length)] as AppBoxState['type'];

			// Get viewport dimensions and current canvas state
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const zoom = canvasStore.zoom;
			const offsetX = canvasStore.offsetX;
			const offsetY = canvasStore.offsetY;

			// Calculate viewport center in world coordinates
			const center = getViewportCenterInWorld(
				viewportWidth,
				viewportHeight,
				zoom,
				offsetX,
				offsetY
			);

			// Create content based on node type (matching CanvasViewport.createNewNode)
			let content: any;
			switch (randomType) {
				case 'sticky':
					content = 'New note...';
					break;
				case 'code':
					content = {
						code: '// New code block\nconsole.log("Hello, world!");',
						language: 'javascript'
					};
					break;
				case 'image':
					content = 'Image placeholder';
					break;
				case 'embed':
					content = ''; // Start with empty content to show input prompt
					break;
				default:
					content = 'New content';
			}

			// Calculate node dimensions based on type
			let width, height;
			switch (randomType) {
				case 'code':
					width = 500;
					height = 300;
					break;
				case 'embed':
					width = 800;
					height = 450;
					break;
				default:
					width = 400;
					height = 400;
			}

			const newBox: AppBoxState = {
				id: Date.now(), // Temporary ID, will be replaced by TurtleDB
				x: Math.round(center.x - width / 2), // Center the box horizontally
				y: Math.round(center.y - height / 2), // Center the box vertically
				width: width,
				height: height,
				color: defaultColor,
				content: content,
				type: randomType,
				z: 0
			};

			canvasStore.addBox(newBox);
			console.log('Created new node:', randomType);
		} catch (error) {
			console.error('Failed to create new node:', error);
		}
	}

	// Zoom in (increase zoom by 25%)
	function handleZoomIn() {
		try {
			const currentZoom = canvasStore.zoom;
			const newZoom = Math.min(currentZoom * 1.25, 5); // Max zoom 5x
			canvasStore.setZoom(newZoom, { autoUnfocus: true });
			console.log(`Zoomed in to ${newZoom.toFixed(2)}x`);
		} catch (error) {
			console.error('Failed to zoom in:', error);
		}
	}

	// Zoom out (decrease zoom by 20%)
	function handleZoomOut() {
		try {
			const currentZoom = canvasStore.zoom;
			const newZoom = Math.max(currentZoom * 0.8, 0.1); // Min zoom 0.1x
			canvasStore.setZoom(newZoom, { autoUnfocus: true });
			console.log(`Zoomed out to ${newZoom.toFixed(2)}x`);
		} catch (error) {
			console.error('Failed to zoom out:', error);
		}
	}

	// Reset zoom and center viewport
	function handleZoomReset() {
		try {
			canvasStore.setTargetViewport({ zoom: 1, x: 0, y: 0 });
			console.log('Reset zoom and centered viewport');
		} catch (error) {
			console.error('Failed to reset zoom:', error);
		}
	}
</script>

<div class="dock-container">
	<button class="dock-btn" title="Create New Graph" on:click={handleNewGraph}>
		<Plus />
	</button>
	<button class="dock-btn" title="Visit Previous Graph" on:click={handleVisitGraph}>
		<FolderOpen />
	</button>
	<button class="dock-btn" title="Create New Node" on:click={handleNewNode}>
		<FilePlus />
	</button>
	<div class="dock-divider"></div>
	<button class="dock-btn" title="Zoom In" on:click={handleZoomIn}>
		<ZoomIn />
	</button>
	<button class="dock-btn" title="Zoom Out" on:click={handleZoomOut}>
		<ZoomOut />
	</button>
	<button class="dock-btn" title="Reset Zoom" on:click={handleZoomReset}>
		<Maximize2 />
	</button>
</div>

<style>
	.dock-container {
		position: fixed;
		left: 50%;
		bottom: 32px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 18px;
		background: rgba(24, 24, 28, 0);
		box-shadow:
			0 4px 32px rgba(0, 0, 0, 0.18),
			0 1.5px 8px rgba(0, 0, 0, 0.1);
		border-radius: 18px;
		padding: 10px 28px;
		backdrop-filter: blur(16px) saturate(1.2);
		z-index: 1000;
		min-width: 340px;
		max-width: 90vw;
	}
	.dock-btn {
		background: rgba(255, 255, 255, 0.08);
		border: none;
		outline: none;
		border-radius: 10px;
		padding: 8px 10px;
		color: #eaeaea;
		font-size: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.18s,
			color 0.18s,
			transform 0.12s;
		cursor: pointer;
	}
	.dock-btn:hover,
	.dock-btn:focus {
		background: rgba(255, 255, 255, 0.18);
		color: #fff;
		transform: translateY(-2px) scale(1.08);
	}
	.dock-divider {
		width: 2px;
		height: 28px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		margin: 0 8px;
	}
	@media (max-width: 600px) {
		.dock-container {
			padding: 8px 8px;
			gap: 10px;
			min-width: unset;
		}
		.dock-btn {
			padding: 6px 6px;
			font-size: 18px;
		}
		.dock-divider {
			height: 18px;
			margin: 0 4px;
		}
	}
</style>
