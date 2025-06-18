// Animation Tracer - Comprehensive performance analysis for canvas animations
// This tracer captures detailed metrics during animations and generates reports

class AnimationTracer {
	constructor() {
		this.traces = [];
		this.currentTrace = null;
		this.isTracing = false;
	}

	startTrace(name, parameters = {}) {
		if (this.isTracing) {
			console.warn('⚠️ Already tracing, stopping previous trace');
			this.stopTrace();
		}

		this.currentTrace = {
			name,
			parameters,
			startTime: performance.now(),
			startState: this.captureState(),
			frames: [],
			events: [],
			endTime: null,
			endState: null,
			completed: false
		};

		this.isTracing = true;
		this.logEvent('trace_started', { name, parameters });

		// Start frame monitoring
		this.monitorFrames();

		console.log(`🔍 Started tracing: ${name}`, parameters);
		return this.currentTrace;
	}

	stopTrace() {
		if (!this.isTracing || !this.currentTrace) {
			console.warn('⚠️ No active trace to stop');
			return null;
		}

		this.currentTrace.endTime = performance.now();
		this.currentTrace.endState = this.captureState();
		this.currentTrace.completed = true;
		this.isTracing = false;

		this.logEvent('trace_stopped');

		// Store the completed trace
		this.traces.push(this.currentTrace);

		// Generate report
		const report = this.generateReport(this.currentTrace);
		console.log('📊 Animation Trace Complete:', report);

		const completedTrace = this.currentTrace;
		this.currentTrace = null;

		return completedTrace;
	}

	captureState() {
		const store = window.canvasStore;
		if (!store) return null;

		const state = store.getState();
		return {
			timestamp: performance.now(),
			zoom: state.zoom,
			offsetX: state.offsetX,
			offsetY: state.offsetY,
			targetZoom: state.targetZoom,
			targetOffsetX: state.targetOffsetX,
			targetOffsetY: state.targetOffsetY,
			animationDuration: state.animationDuration,
			isAnimatingDoublezoom: state.isAnimatingDoublezoom,
			isAnimatingFullscreen: state.isAnimatingFullscreen
		};
	}

	logEvent(type, data = {}) {
		if (!this.currentTrace) return;

		const event = {
			type,
			timestamp: performance.now(),
			relativeTime: performance.now() - this.currentTrace.startTime,
			data,
			state: this.captureState()
		};

		this.currentTrace.events.push(event);
	}

	monitorFrames() {
		if (!this.isTracing) return;

		const frameStart = performance.now();
		const state = this.captureState();

		if (state) {
			const frame = {
				frameNumber: this.currentTrace.frames.length + 1,
				timestamp: frameStart,
				relativeTime: frameStart - this.currentTrace.startTime,
				state: state,
				deltaTime:
					this.currentTrace.frames.length > 0
						? frameStart - this.currentTrace.frames[this.currentTrace.frames.length - 1].timestamp
						: 0
			};

			// Calculate progress towards target
			if (this.currentTrace.startState) {
				const startState = this.currentTrace.startState;
				const current = state;

				frame.progress = {
					zoom: this.calculateProgress(startState.zoom, current.zoom, current.targetZoom),
					offsetX: this.calculateProgress(
						startState.offsetX,
						current.offsetX,
						current.targetOffsetX
					),
					offsetY: this.calculateProgress(
						startState.offsetY,
						current.offsetY,
						current.targetOffsetY
					)
				};

				frame.distances = {
					zoomRemaining: Math.abs(current.targetZoom - current.zoom),
					offsetRemaining: Math.sqrt(
						Math.pow(current.targetOffsetX - current.offsetX, 2) +
							Math.pow(current.targetOffsetY - current.offsetY, 2)
					)
				};

				frame.isNearTarget =
					frame.distances.zoomRemaining < 0.001 && frame.distances.offsetRemaining < 1;
			}

			this.currentTrace.frames.push(frame);

			// Auto-stop if animation appears complete
			if (frame.isNearTarget && this.currentTrace.frames.length > 10) {
				setTimeout(() => this.stopTrace(), 100);
				return;
			}
		}

		// Continue monitoring
		if (this.isTracing) {
			requestAnimationFrame(() => this.monitorFrames());
		}
	}

	calculateProgress(start, current, target) {
		if (Math.abs(target - start) < 0.0001) return 1; // No movement needed
		return Math.abs(current - start) / Math.abs(target - start);
	}

	generateReport(trace) {
		const duration = trace.endTime - trace.startTime;
		const frameCount = trace.frames.length;
		const avgFPS = frameCount / (duration / 1000);

		// Calculate total distances
		const startState = trace.startState;
		const endState = trace.endState;

		const totalZoomDistance = Math.abs(endState.targetZoom - startState.zoom);
		const totalOffsetDistance = Math.sqrt(
			Math.pow(endState.targetOffsetX - startState.offsetX, 2) +
				Math.pow(endState.targetOffsetY - startState.offsetY, 2)
		);

		// Find slowest frames
		const frameTimes = trace.frames.map((f) => f.deltaTime).filter((dt) => dt > 0);
		const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
		const maxFrameTime = Math.max(...frameTimes);

		// Animation velocity analysis
		const midFrame = trace.frames[Math.floor(trace.frames.length / 2)];
		const earlyProgress = trace.frames[Math.min(10, trace.frames.length - 1)]?.progress;
		const lateProgress = trace.frames[Math.max(trace.frames.length - 10, 0)]?.progress;

		const report = {
			summary: {
				name: trace.name,
				duration: `${duration.toFixed(1)}ms`,
				frameCount,
				avgFPS: avgFPS.toFixed(1),
				completed: trace.completed
			},
			parameters: trace.parameters,
			distances: {
				zoom: totalZoomDistance.toFixed(3),
				offset: totalOffsetDistance.toFixed(1),
				isLargeOffset: totalOffsetDistance > 5000
			},
			performance: {
				avgFrameTime: `${avgFrameTime.toFixed(2)}ms`,
				maxFrameTime: `${maxFrameTime.toFixed(2)}ms`,
				slowFrames: frameTimes.filter((dt) => dt > 16.67).length, // >60fps
				droppedFrames: frameTimes.filter((dt) => dt > 33.33).length // >30fps
			},
			progress: {
				early: earlyProgress,
				mid: midFrame?.progress,
				late: lateProgress
			},
			issues: this.analyzeIssues(trace, totalOffsetDistance, duration, avgFrameTime)
		};

		return report;
	}

	analyzeIssues(trace, totalOffsetDistance, duration, avgFrameTime) {
		const issues = [];

		if (duration > 1000) {
			issues.push({
				type: 'slow_animation',
				severity: 'high',
				message: `Animation took ${(duration / 1000).toFixed(1)}s, expected ~250ms`,
				suggestion: 'Check animation easing function and distance calculations'
			});
		}

		if (totalOffsetDistance > 10000) {
			issues.push({
				type: 'large_distance',
				severity: 'high',
				message: `Offset distance is ${totalOffsetDistance.toFixed(0)}px`,
				suggestion: 'Check zoom-to-box calculation for coordinate system errors'
			});
		}

		if (avgFrameTime > 20) {
			issues.push({
				type: 'poor_performance',
				severity: 'medium',
				message: `Average frame time is ${avgFrameTime.toFixed(1)}ms`,
				suggestion: 'Optimize rendering or reduce animation complexity'
			});
		}

		const lastFrame = trace.frames[trace.frames.length - 1];
		if (lastFrame && !lastFrame.isNearTarget) {
			issues.push({
				type: 'incomplete_animation',
				severity: 'medium',
				message: 'Animation stopped before reaching target',
				suggestion: 'Check animation completion logic'
			});
		}

		return issues;
	}

	// Convenience methods for common traces
	traceZoomToBox(boxId, viewportWidth, viewportHeight) {
		const store = window.canvasStore;
		if (!store) {
			console.error('❌ canvasStore not available');
			return;
		}

		const box = store.getState().boxes.find((b) => b.id === boxId);
		if (!box) {
			console.error(`❌ Box ${boxId} not found`);
			return;
		}

		const trace = this.startTrace('zoom_to_box', {
			boxId,
			boxPosition: { x: box.x, y: box.y, z: box.z },
			viewport: { width: viewportWidth, height: viewportHeight }
		});

		// Trigger the zoom
		this.logEvent('zoom_triggered');
		store.zoomToBox(boxId, viewportWidth, viewportHeight);
		this.logEvent('zoom_called');

		return trace;
	}

	// Export trace data
	exportTrace(trace) {
		const data = trace || this.traces[this.traces.length - 1];
		if (!data) {
			console.error('❌ No trace data to export');
			return;
		}

		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `animation-trace-${data.name}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);

		console.log('📁 Trace exported to file');
	}

	// Get summary of all traces
	getAllTraces() {
		return this.traces.map((trace) => ({
			name: trace.name,
			duration: trace.endTime - trace.startTime,
			frameCount: trace.frames.length,
			parameters: trace.parameters,
			completed: trace.completed
		}));
	}
}

// Create global tracer instance
const tracer = new AnimationTracer();

// Expose to window
if (typeof window !== 'undefined') {
	window.animationTracer = tracer;

	// Convenience functions
	window.traceZoomToBox = (boxId = 1) => {
		return tracer.traceZoomToBox(boxId, window.innerWidth, window.innerHeight);
	};

	window.stopTrace = () => tracer.stopTrace();
	window.exportTrace = () => tracer.exportTrace();
	window.getAllTraces = () => tracer.getAllTraces();
}

console.log(`
🔍 Animation Tracer Loaded!

Quick commands:
- traceZoomToBox(1) - Start tracing zoom to box 1
- stopTrace() - Stop current trace and get report
- exportTrace() - Download trace data as JSON
- getAllTraces() - See all trace summaries

The tracer will automatically stop when animation completes.
`);

export { AnimationTracer, tracer };
