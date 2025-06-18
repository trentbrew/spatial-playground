// Standalone Animation Debug Script
// Copy and paste this entire script into the browser console while on the canvas app

console.log('🧪 Animation Debug Script Started');

// Test the current animation state
function debugAnimation() {
	const store = window.canvasStore;
	if (!store) {
		console.error('❌ canvasStore not found on window');
		return;
	}

	const state = store.getState();
	console.log('📊 Current Store State:', {
		current: {
			zoom: state.zoom.toFixed(3),
			offsetX: state.offsetX.toFixed(1),
			offsetY: state.offsetY.toFixed(1)
		},
		target: {
			zoom: state.targetZoom.toFixed(3),
			offsetX: state.targetOffsetX.toFixed(1),
			offsetY: state.targetOffsetY.toFixed(1)
		},
		animation: {
			duration: state.animationDuration,
			isAnimating: state.animationDuration > 0
		}
	});

	// Calculate distances
	const zoomDistance = Math.abs(state.targetZoom - state.zoom);
	const offsetDistance = Math.sqrt(
		Math.pow(state.targetOffsetX - state.offsetX, 2) +
			Math.pow(state.targetOffsetY - state.offsetY, 2)
	);

	console.log('📏 Animation Distances:', {
		zoom: zoomDistance.toFixed(3),
		offset: offsetDistance.toFixed(1),
		isLargeDistance: offsetDistance > 5000
	});

	if (offsetDistance > 5000) {
		console.warn('⚠️ Large offset distance detected - this could cause slow animation!');
	}

	return { state, zoomDistance, offsetDistance };
}

// Test zoom-to-box calculation manually
function testZoomToBox(boxId = 1) {
	const store = window.canvasStore;
	if (!store) return;

	const state = store.getState();
	const box = state.boxes.find((b) => b.id === boxId);
	if (!box) {
		console.error(`Box ${boxId} not found`);
		return;
	}

	console.log(`🎯 Testing Zoom to Box ${boxId}:`, box);

	// Simulate the calculation
	const focusZoom = window.getFocusZoomForZ?.(box.z) || 1;
	const boxCenterX = box.x + box.width / 2;
	const boxCenterY = box.y + box.height / 2;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	const targetOffsetX = viewportWidth / 2 - boxCenterX * focusZoom;
	const targetOffsetY = viewportHeight / 2 - boxCenterY * focusZoom;

	console.log('📐 Calculated targets:', {
		focusZoom: focusZoom.toFixed(3),
		boxCenter: { x: boxCenterX, y: boxCenterY },
		viewport: { width: viewportWidth, height: viewportHeight },
		targetOffset: { x: targetOffsetX.toFixed(1), y: targetOffsetY.toFixed(1) },
		currentOffset: { x: state.offsetX.toFixed(1), y: state.offsetY.toFixed(1) },
		distance: Math.sqrt(
			Math.pow(targetOffsetX - state.offsetX, 2) + Math.pow(targetOffsetY - state.offsetY, 2)
		).toFixed(1)
	});
}

// Monitor animation progress
function monitorAnimation(duration = 5000) {
	console.log('⏱️ Starting animation monitor...');
	let frameCount = 0;
	let startTime = Date.now();
	let lastZoom = null;
	let lastOffsetX = null;
	let lastOffsetY = null;

	const monitor = () => {
		const elapsed = Date.now() - startTime;
		if (elapsed > duration) {
			console.log(`✅ Animation monitoring completed after ${frameCount} frames`);
			return;
		}

		const state = window.canvasStore?.getState();
		if (state) {
			const changed =
				state.zoom !== lastZoom || state.offsetX !== lastOffsetX || state.offsetY !== lastOffsetY;

			if (changed) {
				frameCount++;
				console.log(`Frame ${frameCount} (${elapsed}ms):`, {
					zoom: state.zoom.toFixed(3),
					offset: `(${state.offsetX.toFixed(1)}, ${state.offsetY.toFixed(1)})`,
					target: `zoom=${state.targetZoom.toFixed(3)}, offset=(${state.targetOffsetX.toFixed(1)}, ${state.targetOffsetY.toFixed(1)})`
				});

				lastZoom = state.zoom;
				lastOffsetX = state.offsetX;
				lastOffsetY = state.offsetY;
			}
		}

		requestAnimationFrame(monitor);
	};

	requestAnimationFrame(monitor);
}

// Full test sequence
function runFullTest() {
	console.log('\n🚀 Running Full Animation Test...');

	// 1. Check initial state
	const initial = debugAnimation();

	// 2. Test calculations
	testZoomToBox(1);

	// 3. Start monitoring
	monitorAnimation(3000);

	// 4. Trigger zoom after a short delay
	setTimeout(() => {
		console.log('🎯 Triggering zoomToBox...');
		window.canvasStore?.zoomToBox(1, window.innerWidth, window.innerHeight);

		// Check state immediately after
		setTimeout(() => {
			console.log('📊 State after zoomToBox:');
			debugAnimation();
		}, 10);
	}, 100);
}

// Expose functions to console
window.debugAnimation = debugAnimation;
window.testZoomToBox = testZoomToBox;
window.monitorAnimation = monitorAnimation;
window.runFullTest = runFullTest;

console.log(`
✅ Debug functions loaded! Available commands:
- debugAnimation() - Check current state
- testZoomToBox(boxId) - Test calculation for specific box
- monitorAnimation(duration) - Watch animation progress
- runFullTest() - Run complete test sequence

Try: runFullTest()
`);
