<script lang="ts">
	import { onMount } from 'svelte';

	let isTracing = $state(false);
	let traceName = $state('');
	let traceStartTime = $state(0);
	let elapsedTime = $state(0);

	let intervalId: number | null = null;

	onMount(() => {
		// Check for tracer availability and monitor its state
		const checkTracingState = () => {
			if (typeof window !== 'undefined' && window.animationTracer) {
				const tracer = window.animationTracer;
				const wasTracing = isTracing;
				isTracing = tracer.isTracing;

				if (tracer.currentTrace) {
					traceName = tracer.currentTrace.name;
					traceStartTime = tracer.currentTrace.startTime;
				}

				// Start/stop timer based on tracing state
				if (isTracing && !wasTracing) {
					startTimer();
				} else if (!isTracing && wasTracing) {
					stopTimer();
				}
			}
		};

		// Check every 100ms
		const checkInterval = setInterval(checkTracingState, 100);

		return () => {
			clearInterval(checkInterval);
			stopTimer();
		};
	});

	function startTimer() {
		if (intervalId) return;

		intervalId = setInterval(() => {
			elapsedTime = performance.now() - traceStartTime;
		}, 50) as unknown as number;
	}

	function stopTimer() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	function handleStopTrace() {
		if (typeof window !== 'undefined' && window.stopTrace) {
			window.stopTrace();
		}
	}
</script>

{#if isTracing}
	<div class="tracing-indicator" role="status" aria-live="polite">
		<div class="indicator-content">
			<div class="pulse-dot"></div>
			<div class="trace-info">
				<div class="trace-name">🔍 Tracing: {traceName}</div>
				<div class="trace-time">{(elapsedTime / 1000).toFixed(1)}s</div>
			</div>
			<button class="stop-button" onclick={handleStopTrace} title="Stop tracing"> ⏹️ </button>
		</div>
	</div>
{/if}

<style>
	.tracing-indicator {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.9);
		color: white;
		padding: 12px 16px;
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 14px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.indicator-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.pulse-dot {
		width: 8px;
		height: 8px;
		background: #00ff00;
		border-radius: 50%;
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.6;
			transform: scale(1.2);
		}
	}

	.trace-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.trace-name {
		font-weight: 500;
		color: #00ff00;
	}

	.trace-time {
		font-size: 12px;
		color: #ccc;
	}

	.stop-button {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		transition: background-color 0.2s;
	}

	.stop-button:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.stop-button:active {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
