<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore.svelte';

	const boxes = $derived(canvasStore.boxes);

	// Calculate scene statistics
	const sceneStats = $derived.by(() => {
		const depthCounts = new Map<number, number>();
		const typeCounts = new Map<string, number>();

		for (const box of boxes) {
			// Count by depth
			depthCounts.set(box.z, (depthCounts.get(box.z) || 0) + 1);

			// Count by type
			typeCounts.set(box.type, (typeCounts.get(box.type) || 0) + 1);
		}

		// Sort depths for display
		const sortedDepths = Array.from(depthCounts.entries()).sort((a, b) => a[0] - b[0]);
		const sortedTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);

		return {
			totalNodes: boxes.length,
			depthDistribution: sortedDepths,
			typeDistribution: sortedTypes,
			depthRange: {
				min: Math.min(...Array.from(depthCounts.keys())),
				max: Math.max(...Array.from(depthCounts.keys()))
			}
		};
	});

	let isExpanded = $state(false);
</script>

<div class="scene-stats" class:expanded={isExpanded}>
	<button
		class="stats-toggle"
		onclick={() => (isExpanded = !isExpanded)}
		title="Toggle scene statistics"
	>
		📊 Scene Stats {isExpanded ? '▼' : '▶'}
	</button>

	{#if isExpanded}
		<div class="stats-content">
			<div class="stat-section">
				<h4>Overview</h4>
				<div class="stat-item">
					Total Nodes: <span class="stat-value">{sceneStats.totalNodes}</span>
				</div>
				<div class="stat-item">
					Depth Range: <span class="stat-value"
						>{sceneStats.depthRange.min} to {sceneStats.depthRange.max}</span
					>
				</div>
			</div>

			<div class="stat-section">
				<h4>Depth Distribution</h4>
				{#each sceneStats.depthDistribution as [depth, count]}
					<div class="stat-item depth-item">
						<span class="depth-label" class:background={depth < 0} class:foreground={depth > 0}>
							Z{depth >= 0 ? '+' : ''}{depth}
						</span>
						<span class="stat-value">{count} node{count !== 1 ? 's' : ''}</span>
					</div>
				{/each}
			</div>

			<div class="stat-section">
				<h4>Node Types</h4>
				{#each sceneStats.typeDistribution as [type, count]}
					<div class="stat-item">
						<span class="type-label">{type}</span>
						<span class="stat-value">{count}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.scene-stats {
		position: fixed;
		top: 20px;
		left: 20px;
		z-index: 200;
		background: rgba(0, 0, 0, 0.85);
		color: white;
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-width: 200px;
	}

	.stats-toggle {
		width: 100%;
		background: transparent;
		border: none;
		color: white;
		padding: 10px 12px;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		border-radius: 8px;
		transition: background-color 0.2s;
	}

	.stats-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.stats-content {
		padding: 0 12px 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.stat-section {
		margin-bottom: 16px;
	}

	.stat-section:last-child {
		margin-bottom: 0;
	}

	h4 {
		margin: 12px 0 8px 0;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 600;
	}

	.stat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
		padding: 2px 0;
	}

	.stat-value {
		font-weight: 600;
		color: #4ecdc4;
	}

	.depth-item {
		position: relative;
	}

	.depth-label {
		padding: 2px 6px;
		border-radius: 3px;
		font-weight: 600;
		font-size: 10px;
	}

	.depth-label.background {
		background: rgba(255, 107, 107, 0.3);
		color: #ff6b6b;
	}

	.depth-label.foreground {
		background: rgba(69, 183, 209, 0.3);
		color: #45b7d1;
	}

	.depth-label:not(.background):not(.foreground) {
		background: rgba(150, 206, 180, 0.3);
		color: #96ceb4;
	}

	.type-label {
		text-transform: capitalize;
		color: rgba(255, 255, 255, 0.9);
	}
</style>
