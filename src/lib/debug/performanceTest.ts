/**
 * Performance Testing Utility for Canvas Interactions
 *
 * To use this:
 * 1. Set ENABLE_PERFORMANCE_LOGGING = true in panning.ts and zooming.ts
 * 2. Import and call enablePerformanceMonitoring() in your main component
 * 3. Open browser dev tools and check console during interactions
 */

export interface PerformanceMetrics {
	frameRate: number;
	memoryUsage: number;
	interactionLatency: number;
	eventProcessingTime: number;
}

class PerformanceMonitor {
	private isMonitoring = false;
	private frameCount = 0;
	private lastFrameTime = 0;
	private frameRates: number[] = [];
	private interactionTimes: number[] = [];

	start() {
		if (this.isMonitoring) return;

		this.isMonitoring = true;
		this.frameCount = 0;
		this.lastFrameTime = performance.now();

		console.log('🔍 Performance monitoring started');

		// Start frame rate monitoring
		this.monitorFrameRate();

		// Monitor memory if available
		if ('memory' in performance) {
			this.monitorMemory();
		}
	}

	stop() {
		if (!this.isMonitoring) return;

		this.isMonitoring = false;

		// Calculate average metrics
		const avgFrameRate =
			this.frameRates.length > 0
				? this.frameRates.reduce((a, b) => a + b) / this.frameRates.length
				: 0;

		const avgInteractionTime =
			this.interactionTimes.length > 0
				? this.interactionTimes.reduce((a, b) => a + b) / this.interactionTimes.length
				: 0;

		console.log('📊 Performance Summary:', {
			averageFrameRate: avgFrameRate.toFixed(2),
			averageInteractionTime: avgInteractionTime.toFixed(2) + 'ms',
			totalInteractions: this.interactionTimes.length,
			frameRateStability: this.calculateStability(this.frameRates)
		});

		// Reset arrays
		this.frameRates = [];
		this.interactionTimes = [];
	}

	recordInteraction(startTime: number, endTime: number) {
		if (!this.isMonitoring) return;

		const duration = endTime - startTime;
		this.interactionTimes.push(duration);

		if (duration > 16) {
			// Longer than one frame at 60fps
			console.warn('⚠️ Slow interaction detected:', duration.toFixed(2) + 'ms');
		}
	}

	private monitorFrameRate() {
		if (!this.isMonitoring) return;

		const currentTime = performance.now();
		const deltaTime = currentTime - this.lastFrameTime;

		if (deltaTime > 0) {
			const frameRate = 1000 / deltaTime;
			this.frameRates.push(frameRate);

			// Keep only recent data (last 60 frames)
			if (this.frameRates.length > 60) {
				this.frameRates.shift();
			}
		}

		this.lastFrameTime = currentTime;
		this.frameCount++;

		requestAnimationFrame(() => this.monitorFrameRate());
	}

	private monitorMemory() {
		if (!this.isMonitoring || !('memory' in performance)) return;

		const memory = (performance as any).memory;
		console.log('🧠 Memory:', {
			used: (memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + 'MB',
			total: (memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + 'MB',
			limit: (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + 'MB'
		});

		setTimeout(() => this.monitorMemory(), 5000); // Check every 5 seconds
	}

	private calculateStability(values: number[]): string {
		if (values.length < 2) return 'N/A';

		const avg = values.reduce((a, b) => a + b) / values.length;
		const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
		const stdDev = Math.sqrt(variance);
		const coefficient = (stdDev / avg) * 100;

		if (coefficient < 5) return 'Excellent';
		if (coefficient < 10) return 'Good';
		if (coefficient < 20) return 'Fair';
		return 'Poor';
	}
}

// Global instance
const performanceMonitor = new PerformanceMonitor();

export function enablePerformanceMonitoring() {
	// Add keyboard shortcuts for easy testing
	document.addEventListener('keydown', (event) => {
		if (event.ctrlKey && event.shiftKey) {
			switch (event.key) {
				case 'P': // Ctrl+Shift+P to start monitoring
					event.preventDefault();
					performanceMonitor.start();
					break;
				case 'S': // Ctrl+Shift+S to stop monitoring
					event.preventDefault();
					performanceMonitor.stop();
					break;
			}
		}
	});

	console.log('🎯 Performance monitoring enabled');
	console.log('📋 Controls:');
	console.log('  • Ctrl+Shift+P - Start monitoring');
	console.log('  • Ctrl+Shift+S - Stop monitoring');
	console.log('  • Set ENABLE_PERFORMANCE_LOGGING = true in interaction files for detailed logs');
}

export { performanceMonitor };
