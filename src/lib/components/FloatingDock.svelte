<script lang="ts">
	import {
		Plus,
		FolderOpen,
		FilePlus,
		ZoomIn,
		ZoomOut,
		Maximize2,
		Download,
		Save as SaveIcon,
		StickyNote,
		Code,
		Image as ImageIcon,
		Globe,
		FileText,
		Music
	} from 'lucide-svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { turtleDbStore } from '$lib/stores/turtleDbStore';
	import { getViewportCenterInWorld } from '$lib/utils/coordinates';
	import type { AppBoxState } from '$lib/canvasState';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenuStore.svelte';

	// Tooltip state
	let hoveredButton = '';
	let tooltipPosition = { x: 0, y: 0 };

	function showTooltip(event: MouseEvent, buttonId: string) {
		hoveredButton = buttonId;
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			x: rect.left + rect.width / 2,
			y: rect.top - 8
		};
	}

	function hideTooltip() {
		hoveredButton = '';
	}

	// Create new graph
	async function handleNewGraph() {
		try {
			if (turtleDbStore.isAvailable()) {
				// Original turtle-db functionality would go here
				console.log('Created new graph');
			} else {
				console.log('turtle-db not available - graph functionality disabled');
			}
		} catch (error) {
			console.error('Failed to create new graph:', error);
		}
	}

	// Switch to previous graph (cycle through available graphs)
	async function handleVisitGraph() {
		try {
			if (turtleDbStore.isAvailable()) {
				// Original turtle-db functionality would go here
				console.log('Switched to graph');
			} else {
				console.log('turtle-db not available - graph functionality disabled');
			}
		} catch (error) {
			console.error('Failed to switch graph:', error);
		}
	}

	// Show context menu for adding a new node (same items as background right-click)
	function handleNewNode(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		const items: ContextMenuItem[] = [
			{ id: 'add-note', label: 'Add Note', icon: StickyNote },
			// { id: 'add-code', label: 'Add Code Block', icon: Code },
			{ id: 'add-image', label: 'Add Image', icon: ImageIcon },
			{ id: 'add-embed', label: 'Add Embed', icon: Globe },
			{ id: 'add-pdf', label: 'Add PDF', icon: FileText },
			{ id: 'add-audio', label: 'Add Audio', icon: Music }
		];

		// Screen coords: show menu just above the button
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const showX = rect.left;
		const showY = rect.top - 8;

		contextMenuStore.show(showX, showY, items);

		// After menu mounts, shift it upward above the button
		setTimeout(() => {
			const menuEl = document.querySelector('.context-menu') as HTMLElement | null;
			if (menuEl) {
				const newY = rect.top - menuEl.offsetHeight - 8;
				contextMenuStore.updatePosition(showX, newY);
			}
		}, 0);
	}

	// Zoom in (increase zoom by 25%)
	function handleZoomIn() {
		try {
			const currentZoom = canvasStore.zoom;
			const newZoom = Math.min(currentZoom * 1.25, 5); // Max zoom 5x
			// Use smooth zoom animation
			canvasStore.setTargetViewportAnimated(
				{
					zoom: newZoom,
					x: canvasStore.offsetX,
					y: canvasStore.offsetY
				},
				300
			);
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
			// Use smooth zoom animation
			canvasStore.setTargetViewportAnimated(
				{
					zoom: newZoom,
					x: canvasStore.offsetX,
					y: canvasStore.offsetY
				},
				300
			);
			console.log(`Zoomed out to ${newZoom.toFixed(2)}x`);
		} catch (error) {
			console.error('Failed to zoom out:', error);
		}
	}

	// Reset zoom and center viewport
	function handleZoomReset() {
		try {
			// Use smooth animation for reset
			canvasStore.setTargetViewportAnimated({ zoom: 1, x: 0, y: 0 }, 600);
			console.log('Reset zoom and centered viewport');
		} catch (error) {
			console.error('Failed to reset zoom:', error);
		}
	}

	// Export current canvas as downloadable JSON
	function handleExport() {
		try {
			const state = canvasStore.getState();
			const json = JSON.stringify(state, null, 2);

			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const a = document.createElement('a');
			a.href = url;
			a.download = `canvas-${timestamp}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			console.log('✅ Canvas exported');
		} catch (err) {
			console.error('❌ Failed to export canvas:', err);
		}
	}

	// Upload canvas JSON to PocketBase CDN collection
	async function handleSave() {
		try {
			const SIZE_LIMIT = 5_000_000; // 5MB PocketBase default

			// Prepare a slimmed payload that won't exceed the limit
			const fullState = canvasStore.getState();
			const { boxes, ...viewport } = fullState;

			const slim: any = { ...viewport, boxes: [] };
			let runningSize = JSON.stringify(slim).length;

			// Greedy include boxes until hitting the limit
			for (const box of boxes) {
				const boxStr = JSON.stringify(box);
				if (runningSize + boxStr.length > SIZE_LIMIT) {
					console.warn(`⏭️ Skipping box ${box.id} to stay under PocketBase file cap`);
					continue;
				}
				slim.boxes.push(box);
				runningSize += boxStr.length;
			}

			const jsonPayload = JSON.stringify(slim);

			const blob = new Blob([jsonPayload], { type: 'application/json' });
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const canvasName = prompt('Canvas name', 'Untitled Canvas') ?? 'Untitled Canvas';
			const fileName = `${canvasName.replace(/[^a-z0-9-_]/gi, '_')}-${timestamp}.json`;

			const formData = new FormData();
			formData.append('file', new File([blob], fileName, { type: 'application/json' }));
			formData.append('name', canvasName);

			const res = await fetch('https://village.pockethost.io/api/collections/cdn/records', {
				method: 'POST',
				body: formData
			});

			if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);

			const record = await res.json();

			// PocketBase exposes file via /api/files/{collection}/{id}/{fileName}
			const fileUrl = `https://village.pockethost.io/api/files/cdn/${record.id}/${record.file}`;

			await navigator.clipboard.writeText(fileUrl);
			console.log('✅ Canvas saved. URL copied to clipboard:', fileUrl);
			alert('Canvas saved! URL copied to clipboard.');
		} catch (err) {
			console.error('❌ Failed to save canvas:', err);
			alert(`Save failed: ${err.message || err}`);
		}
	}
</script>

<div class="dock-container">
	<button
		id="plus"
		class="dock-btn bg-blue-500"
		on:click={handleNewNode}
		on:mouseenter={(e) => showTooltip(e, 'new-node')}
		on:mouseleave={hideTooltip}
	>
		<Plus />
	</button>
	<!-- <button
		class="dock-btn"
		on:click={handleVisitGraph}
		on:mouseenter={(e) => showTooltip(e, 'visit-graph')}
		on:mouseleave={hideTooltip}
	>
		<FolderOpen />
	</button> -->
	<div class="dock-divider"></div>
	<button
		class="dock-btn"
		on:click={handleZoomIn}
		on:mouseenter={(e) => showTooltip(e, 'zoom-in')}
		on:mouseleave={hideTooltip}
	>
		<ZoomIn />
	</button>
	<button
		class="dock-btn"
		on:click={handleZoomOut}
		on:mouseenter={(e) => showTooltip(e, 'zoom-out')}
		on:mouseleave={hideTooltip}
	>
		<ZoomOut />
	</button>
	<button
		class="dock-btn"
		on:click={handleZoomReset}
		on:mouseenter={(e) => showTooltip(e, 'zoom-reset')}
		on:mouseleave={hideTooltip}
	>
		<Maximize2 />
	</button>
	<div class="dock-divider"></div>
	<button
		class="dock-btn"
		on:click={handleExport}
		on:mouseenter={(e) => showTooltip(e, 'export')}
		on:mouseleave={hideTooltip}
	>
		<SaveIcon />
	</button>
	<!-- <button
class="dock-btn"
on:click={handleSave}
on:mouseenter={(e) => showTooltip(e, 'save')}
on:mouseleave={hideTooltip}
>
<Download />
	</button> -->
</div>

{#if hoveredButton}
	<div class="tooltip" style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;">
		{#if hoveredButton === 'new-node'}
			<!-- Create New Node -->
		{:else if hoveredButton === 'visit-graph'}
			Visit Previous Graph
		{:else if hoveredButton === 'zoom-in'}
			Zoom In
		{:else if hoveredButton === 'zoom-out'}
			Zoom Out
		{:else if hoveredButton === 'zoom-reset'}
			Reset Zoom
		{:else if hoveredButton === 'export'}
			Export Canvas
		{:else if hoveredButton === 'save'}
			Save Canvas
		{/if}
	</div>
{/if}

<style>
	#plus {
		background: #007bff !important;
	}
	.dock-container {
		border: 1px solid rgba(255, 255, 255, 0.1);
		position: fixed;
		left: 50%;
		bottom: 32px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 10px;
		background: rgba(24, 24, 28, 0.5);
		box-shadow:
			0 4px 32px rgba(0, 0, 0, 0.18),
			0 1.5px 8px rgba(0, 0, 0, 0.1);
		border-radius: 18px;
		padding: 10px 10px;
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
	.tooltip {
		position: fixed;
		transform: translateX(-50%) translateY(-100%);
		background: rgba(0, 0, 0, 0.9);
		color: white;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		pointer-events: none;
		z-index: 1001;
		backdrop-filter: blur(8px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}
	.tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 4px solid transparent;
		border-top-color: rgba(0, 0, 0, 0.9);
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
		.tooltip {
			font-size: 11px;
			padding: 4px 8px;
		}
	}
</style>
