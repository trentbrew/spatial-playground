<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { canvasStore } from '$lib/stores/canvasStore';

	let canvasElement: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	// Current zoom & pan values
	let zoom: number;
	let offsetX: number;
	let offsetY: number;

	// Flag to schedule a draw on the next animation frame
	let needsDraw = false;

	// Handle unsubscribing the store
	let unsubscribe: () => void;

	// Coordinate Conversion (Local to this component)
	function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
		// Use component's reactive zoom/offset values
		return {
			x: (screenX - offsetX) / zoom,
			y: (screenY - offsetY) / zoom
		};
	}

	// Schedule a draw if one isn't already pending
	function scheduleDraw() {
		if (!browser || needsDraw) return;
		needsDraw = true;
		requestAnimationFrame(draw);
	}

	// Core draw logic
	function draw() {
		needsDraw = false;
		if (!browser || !ctx || !canvasElement) return;

		// Reset transforms and scale for device pixel ratio
		const dpr = window.devicePixelRatio || 1;
		const width = canvasElement.width;
		const height = canvasElement.height;
		const viewWidthLogical = width / dpr;
		const viewHeightLogical = height / dpr;
		ctx.resetTransform();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, viewWidthLogical, viewHeightLogical);

		// Apply world transform (pan + zoom)
		ctx.translate(offsetX, offsetY);
		ctx.scale(zoom, zoom);

		// --- Grid Drawing Logic (World Space) --- //
		const baseGridSize = 100; // World units for the largest grid
		const targetScreenSize = 50; // Ideal apparent size on screen (logical pixels)
		const baseDotRadius = 1; // Base radius in logical pixels at zoom = 1
		const maxGrids = 5;
		const fadeRange = 0.5;

		// Calculate viewport boundaries in world coordinates
		const worldViewTopLeft = screenToWorld(0, 0);
		const worldViewBottomRight = screenToWorld(viewWidthLogical, viewHeightLogical);

		// Iterate through grid levels
		for (let i = 0; i < maxGrids; i++) {
			const gridSizeWorld = baseGridSize / Math.pow(2, i); // Grid size in world units
			const gridSizeScreen = gridSizeWorld * zoom; // Apparent grid size in logical screen pixels

			// Skip grids that are too small or too large on screen
			if (gridSizeScreen < targetScreenSize / 4 || gridSizeScreen > targetScreenSize * 4) {
				continue;
			}

			// Calculate alpha based on closeness to target screen size
			let alpha = 0;
			if (gridSizeScreen > targetScreenSize) {
				alpha = 1.0 - Math.min(1, (gridSizeScreen / targetScreenSize - 1) / fadeRange);
			} else {
				alpha = Math.min(1, gridSizeScreen / (targetScreenSize * (1 - fadeRange)));
			}
			alpha = Math.max(0, alpha * alpha);
			if (alpha <= 0.01) continue;

			// Get base dot color from CSS variable (using canvas parent for styles)
			let finalDotColor = `rgba(200, 200, 200, ${alpha})`; // Fallback
			if (canvasElement.parentElement) {
				try {
					const computedStyle = getComputedStyle(canvasElement.parentElement);
					const baseDotColor = computedStyle.getPropertyValue('--grid-dot-color').trim();
					let r = 200,
						g = 200,
						b = 200; // Default fallback values
					if (baseDotColor.startsWith('rgba')) {
						const parts = baseDotColor.match(/(\d+)/g);
						if (parts && parts.length >= 3) {
							r = parseInt(parts[0]);
							g = parseInt(parts[1]);
							b = parseInt(parts[2]);
						}
					} else if (baseDotColor.startsWith('#')) {
						const hex = baseDotColor.substring(1);
						if (hex.length === 6) {
							r = parseInt(hex.substring(0, 2), 16);
							g = parseInt(hex.substring(2, 4), 16);
							b = parseInt(hex.substring(4, 6), 16);
						} else if (hex.length === 3) {
							r = parseInt(hex.substring(0, 1) + hex.substring(0, 1), 16);
							g = parseInt(hex.substring(1, 2) + hex.substring(1, 2), 16);
							b = parseInt(hex.substring(2, 3) + hex.substring(2, 3), 16);
						}
					}
					finalDotColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
				} catch (e) {
					console.warn('Could not parse CSS variable --grid-dot-color:', e);
				}
			}
			ctx.fillStyle = finalDotColor;

			// Calculate the dot radius in world units to appear constant size on screen
			const dotRadiusWorld = baseDotRadius / zoom;

			// Find the first grid lines within the world view
			const startWorldX = Math.floor(worldViewTopLeft.x / gridSizeWorld) * gridSizeWorld;
			const startWorldY = Math.floor(worldViewTopLeft.y / gridSizeWorld) * gridSizeWorld;
			const endWorldX = worldViewBottomRight.x; // Draw up to the right edge
			const endWorldY = worldViewBottomRight.y; // Draw up to the bottom edge

			// Draw dots at their world coordinates
			for (let worldX = startWorldX; worldX < endWorldX; worldX += gridSizeWorld) {
				for (let worldY = startWorldY; worldY < endWorldY; worldY += gridSizeWorld) {
					ctx.beginPath();
					// Draw arc at world coordinates, radius is also in world units
					ctx.arc(worldX, worldY, dotRadiusWorld, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
		// --- End Grid Drawing Logic --- //

		// Reset transform after drawing
		ctx.resetTransform();
	}

	// Resize canvas to fill its container and respect DPR
	function resizeCanvas() {
		if (!browser || !canvasElement) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvasElement.getBoundingClientRect();
		canvasElement.width = rect.width * dpr;
		canvasElement.height = rect.height * dpr;
		canvasElement.style.width = `${rect.width}px`;
		canvasElement.style.height = `${rect.height}px`;
		scheduleDraw();
	}

	onMount(() => {
		if (!browser) return;
		// Subscribe to store changes only on client
		unsubscribe = canvasStore.subscribe((state) => {
			zoom = state.zoom;
			offsetX = state.offsetX;
			offsetY = state.offsetY;
			scheduleDraw();
		});
		ctx = canvasElement.getContext('2d');
		// Observe container size changes
		const resizeObserver = new ResizeObserver(resizeCanvas);
		if (canvasElement.parentElement) {
			resizeObserver.observe(canvasElement.parentElement);
		}

		// Initial sizing & draw
		resizeCanvas();

		return () => {
			unsubscribe();
			resizeObserver.disconnect();
		};
	});
</script>

<canvas bind:this={canvasElement} class="background-canvas"></canvas>

<style>
	.background-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		background-color: var(--bg-canvas-color);
	}
</style>
