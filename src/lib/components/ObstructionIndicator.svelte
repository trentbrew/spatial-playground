<script lang="ts">
	import { onMount } from 'svelte';

	let isActive = $state(false);
	let obstructionInfo = $state<{
		percentage: number;
		obstructingBoxes: string[];
		avoidanceApplied: boolean;
	} | null>(null);

	let fadeTimeout: number | null = null;

	onMount(() => {
		// Listen for obstruction detection events
		const handleObstructionDetected = (event: CustomEvent) => {
			const { percentage, obstructingBoxes, avoidanceApplied } = event.detail;

			obstructionInfo = {
				percentage,
				obstructingBoxes,
				avoidanceApplied
			};

			isActive = true;

			// Clear any existing fade timeout
			if (fadeTimeout) {
				clearTimeout(fadeTimeout);
			}

			// Fade out after 3 seconds
			fadeTimeout = setTimeout(() => {
				isActive = false;
				obstructionInfo = null;
			}, 3000) as unknown as number;
		};

		// Create custom event listener
		window.addEventListener('obstruction-detected', handleObstructionDetected as EventListener);

		return () => {
			window.removeEventListener(
				'obstruction-detected',
				handleObstructionDetected as EventListener
			);
			if (fadeTimeout) {
				clearTimeout(fadeTimeout);
			}
		};
	});
</script>

{#if isActive && obstructionInfo}
	<div class="obstruction-indicator" role="status" aria-live="polite">
		<div class="indicator-content">
			<div class="icon">🚧</div>
			<div class="info">
				<div class="title">
					{obstructionInfo.avoidanceApplied ? 'Adjusted View' : 'Obstruction Detected'}
				</div>
				<div class="details">
					{obstructionInfo.percentage.toFixed(0)}% blocked by {obstructionInfo.obstructingBoxes.join(
						', '
					)}
				</div>
				{#if obstructionInfo.avoidanceApplied}
					<div class="action">Camera repositioned for better view</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.obstruction-indicator {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 1000;
		background: rgba(255, 165, 0, 0.95);
		color: white;
		padding: 12px 16px;
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		animation: slideIn 0.3s ease-out;
		max-width: 300px;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.indicator-content {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.icon {
		font-size: 18px;
		flex-shrink: 0;
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.title {
		font-weight: 600;
		color: white;
	}

	.details {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.9);
		line-height: 1.3;
	}

	.action {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		margin-top: 2px;
	}
</style>
