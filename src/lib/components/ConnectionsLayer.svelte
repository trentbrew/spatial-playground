<script context="module" lang="ts">
	// Helper function to calculate label position along path
	function getLabelPosition(pathData: string): { x: number; y: number } {
		// Simple approximation: return midpoint of start and end
		// In a real implementation, you'd calculate the actual midpoint of the path
		const matches = pathData.match(/M\s*([\d.-]+)\s*([\d.-]+).*?(\d+\.?\d*)\s*(\d+\.?\d*)/);
		if (matches) {
			const x1 = parseFloat(matches[1]);
			const y1 = parseFloat(matches[2]);
			const x2 = parseFloat(matches[3]);
			const y2 = parseFloat(matches[4]);
			return {
				x: (x1 + x2) / 2,
				y: (y1 + y2) / 2
			};
		}
		return { x: 0, y: 0 };
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { connectionsStore, type Connection } from '$lib/stores/connectionsStore.svelte';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { ArrowRight, Trash2, Edit3 } from 'lucide-svelte';

	// Component state
	let svgElement: SVGSVGElement;
	let hoveredConnectionId: string | null = null;
	let connectionContextMenu: { x: number; y: number; connectionId: string } | null = null;

	// Derived state
	const connections = $derived(connectionsStore.connections);
	const isDrawing = $derived(connectionsStore.isDrawing);
	const previewPath = $derived(connectionsStore.getPreviewPath());
	const selectedConnectionId = $derived(connectionsStore.selectedConnectionId);

	// World transform info
	const zoom = $derived(canvasStore.zoom);
	const offsetX = $derived(canvasStore.offsetX);
	const offsetY = $derived(canvasStore.offsetY);

	// Arrow marker definitions for different types
	const arrowMarkers = [
		{
			id: 'arrow',
			path: 'M 0 0 L 10 5 L 0 10 z'
		},
		{
			id: 'diamond',
			path: 'M 0 5 L 5 0 L 10 5 L 5 10 z'
		},
		{
			id: 'circle',
			path: 'M 5 5 m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0'
		}
	];

	// Generate marker ID for connection
	function getMarkerId(connection: Connection, isSelected: boolean): string {
		const base = `${connection.style.arrowType}-${connection.id}`;
		return isSelected ? `${base}-selected` : base;
	}

	// Handle connection click
	function handleConnectionClick(event: MouseEvent, connectionId: string) {
		event.stopPropagation();
		connectionsStore.selectConnection(selectedConnectionId === connectionId ? null : connectionId);
	}

	// Handle connection context menu
	function handleConnectionContextMenu(event: MouseEvent, connectionId: string) {
		event.preventDefault();
		event.stopPropagation();

		connectionContextMenu = {
			x: event.clientX,
			y: event.clientY,
			connectionId
		};
	}

	// Close context menu
	function closeContextMenu() {
		connectionContextMenu = null;
	}

	// Delete connection
	function deleteConnection(connectionId: string) {
		connectionsStore.removeConnection(connectionId);
		closeContextMenu();
	}

	// Change connection type
	function changeConnectionType(connectionId: string, newType: string) {
		// Implementation for changing connection type
		// This would open a dialog or submenu
		closeContextMenu();
	}

	// Handle clicks outside to close context menu
	function handleDocumentClick() {
		closeContextMenu();
	}

	onMount(() => {
		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	// Calculate connection opacity based on selection state
	function getConnectionOpacity(connection: Connection): number {
		if (selectedConnectionId && selectedConnectionId !== connection.id) {
			return 0.3; // Dim non-selected connections
		}
		return hoveredConnectionId === connection.id ? 1.0 : 0.8;
	}

	// Calculate stroke width based on zoom and selection
	function getStrokeWidth(connection: Connection): number {
		const baseWidth = connection.style.strokeWidth;
		const zoomFactor = Math.max(0.5, Math.min(2, 1 / zoom)); // Scale inversely with zoom
		const selectionMultiplier = selectedConnectionId === connection.id ? 1.5 : 1;
		return baseWidth * zoomFactor * selectionMultiplier;
	}
</script>

<!-- SVG Layer for connections -->
<svg
	bind:this={svgElement}
	class="connections-layer"
	style="
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: auto;
		z-index: 10;
	"
>
	<!-- Marker definitions -->
	<defs>
		{#each arrowMarkers as marker}
			{#each connections as connection}
				<!-- Normal marker -->
				<marker
					id="{marker.id}-{connection.id}"
					markerWidth="10"
					markerHeight="10"
					refX="8"
					refY="5"
					orient="auto"
					markerUnits="strokeWidth"
				>
					<path d={marker.path} fill={connection.color} />
				</marker>

				<!-- Selected marker (highlighted) -->
				<marker
					id="{marker.id}-{connection.id}-selected"
					markerWidth="12"
					markerHeight="12"
					refX="9"
					refY="6"
					orient="auto"
					markerUnits="strokeWidth"
				>
					<path d={marker.path} fill="#3B82F6" stroke="#fff" stroke-width="0.5" />
				</marker>
			{/each}
		{/each}

		<!-- Preview marker -->
		{#if isDrawing}
			<marker
				id="arrow-preview"
				markerWidth="10"
				markerHeight="10"
				refX="8"
				refY="5"
				orient="auto"
				markerUnits="strokeWidth"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" opacity="0.7" />
			</marker>
		{/if}
	</defs>

	<!-- Transform group for world coordinates -->
	<g transform="scale({zoom}) translate({offsetX / zoom}, {offsetY / zoom})">
		<!-- Render connections -->
		{#each connections as connection (connection.id)}
			{@const path = connectionsStore.getConnectionPath(connection)}
			{@const isSelected = selectedConnectionId === connection.id}
			{@const opacity = getConnectionOpacity(connection)}
			{@const strokeWidth = getStrokeWidth(connection)}
			{@const markerId =
				connection.style.arrowType !== 'none' ? getMarkerId(connection, isSelected) : ''}

			{#if path}
				<!-- Connection shadow/outline for better visibility -->
				<path
					d={path}
					fill="none"
					stroke="rgba(0, 0, 0, 0.2)"
					stroke-width={strokeWidth + 2}
					stroke-linecap="round"
					stroke-linejoin="round"
					pointer-events="none"
				/>

				<!-- Main connection path -->
				<path
					d={path}
					fill="none"
					stroke={isSelected ? '#3B82F6' : connection.color}
					stroke-width={strokeWidth}
					stroke-dasharray={connection.style.strokeDashArray || 'none'}
					stroke-linecap="round"
					stroke-linejoin="round"
					marker-end={markerId ? `url(#${markerId})` : 'none'}
					{opacity}
					style="
						cursor: pointer;
						transition: all 0.2s ease;
					"
					class:animate-connection={connection.style.animate}
					onmouseenter={() => (hoveredConnectionId = connection.id)}
					onmouseleave={() => (hoveredConnectionId = null)}
					onclick={(e) => handleConnectionClick(e, connection.id)}
					oncontextmenu={(e) => handleConnectionContextMenu(e, connection.id)}
				/>

				<!-- Connection label -->
				{#if connection.label}
					{@const labelPoint = getLabelPosition(path)}
					<text
						x={labelPoint.x}
						y={labelPoint.y}
						text-anchor="middle"
						dominant-baseline="middle"
						fill={isSelected ? '#3B82F6' : connection.color}
						font-size={12 / zoom}
						font-weight="500"
						{opacity}
						style="pointer-events: none; user-select: none;"
					>
						{connection.label}
					</text>
				{/if}
			{/if}
		{/each}

		<!-- Preview connection while drawing -->
		{#if isDrawing && previewPath}
			<path
				d={previewPath}
				fill="none"
				stroke="#3B82F6"
				stroke-width="2"
				stroke-dasharray="5,5"
				opacity="0.7"
				marker-end="url(#arrow-preview)"
				style="pointer-events: none;"
			/>
		{/if}
	</g>
</svg>

<!-- Connection context menu -->
{#if connectionContextMenu}
	<div
		class="connection-context-menu"
		style="
			position: fixed;
			top: {connectionContextMenu.y}px;
			left: {connectionContextMenu.x}px;
			z-index: 1000;
		"
	>
		<div class="context-menu-content">
			<button
				class="context-menu-item"
				onclick={() => changeConnectionType(connectionContextMenu!.connectionId, 'flow')}
			>
				<ArrowRight size={14} />
				Change Type
			</button>
			<button
				class="context-menu-item"
				onclick={() => deleteConnection(connectionContextMenu!.connectionId)}
			>
				<Trash2 size={14} />
				Delete Connection
			</button>
		</div>
	</div>
{/if}

<style>
	.connections-layer {
		pointer-events: auto;
	}

	@keyframes connection-flow {
		0% {
			stroke-dashoffset: 0;
		}
		100% {
			stroke-dashoffset: 20;
		}
	}

	.animate-connection {
		animation: connection-flow 2s linear infinite;
	}

	.connection-context-menu {
		background: #1a1a1a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		overflow: hidden;
		backdrop-filter: blur(8px);
	}

	.context-menu-content {
		padding: 4px;
		min-width: 160px;
	}

	.context-menu-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border: none;
		background: transparent;
		color: white;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
		transition: background-color 0.15s ease;
	}

	.context-menu-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.context-menu-item:active {
		background: rgba(255, 255, 255, 0.15);
	}
</style>
