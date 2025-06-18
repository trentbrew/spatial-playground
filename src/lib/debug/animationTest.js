// Animation Test Suite for Canvas Engine
// Run this in the browser console to debug zoom-to-box issues

export function runAnimationTests() {
	console.log('🧪 Starting Animation Test Suite...');

	// Test 1: Basic store state
	console.log('\n📊 Test 1: Store State');
	const state = window.canvasStore?.getState();
	if (!state) {
		console.error('❌ canvasStore not found on window object');
		return;
	}

	console.log('Current state:', {
		zoom: state.zoom,
		offsetX: state.offsetX,
		offsetY: state.offsetY,
		targetZoom: state.targetZoom,
		targetOffsetX: state.targetOffsetX,
		targetOffsetY: state.targetOffsetY,
		animationDuration: state.animationDuration,
		boxes: state.boxes.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z }))
	});

	// Test 2: Focus calculations
	console.log('\n🎯 Test 2: Focus Calculations');
	state.boxes.forEach((box) => {
		const focusZoom = window.getFocusZoomForZ?.(box.z);
		const intrinsicScale = window.getIntrinsicScaleFactor?.(box.z);
		const parallaxFactor = window.getParallaxFactor?.(box.z);

		console.log(`Box ${box.id} (z=${box.z}):`, {
			focusZoom,
			intrinsicScale,
			parallaxFactor,
			position: { x: box.x, y: box.y }
		});
	});

	// Test 3: Simulate zoom-to-box calculation
	console.log('\n📐 Test 3: Zoom-to-Box Simulation');
	const testBox = state.boxes[0]; // Test with first box
	const viewportWidth = 1200;
	const viewportHeight = 800;

	if (testBox) {
		const focusZoom = window.getFocusZoomForZ?.(testBox.z) || 1;
		const boxCenterX = testBox.x + testBox.width / 2;
		const boxCenterY = testBox.y + testBox.height / 2;
		const targetOffsetX = viewportWidth / 2 - boxCenterX * focusZoom;
		const targetOffsetY = viewportHeight / 2 - boxCenterY * focusZoom;

		console.log(`Simulated zoom to Box ${testBox.id}:`, {
			boxCenter: { x: boxCenterX, y: boxCenterY },
			focusZoom,
			targetOffset: { x: targetOffsetX, y: targetOffsetY },
			distanceToTravel: {
				zoom: Math.abs(focusZoom - state.zoom),
				x: Math.abs(targetOffsetX - state.offsetX),
				y: Math.abs(targetOffsetY - state.offsetY)
			}
		});

		// Calculate expected animation time based on distance
		const totalDistance = Math.sqrt(
			Math.pow(targetOffsetX - state.offsetX, 2) + Math.pow(targetOffsetY - state.offsetY, 2)
		);
		console.log(`Total distance to travel: ${totalDistance.toFixed(2)} pixels`);

		if (totalDistance > 10000) {
			console.warn('⚠️  WARNING: Very large distance detected! This could cause slow animation.');
		}
	}

	// Test 4: Animation frame timing
	console.log('\n⏱️  Test 4: Animation Timing Test');
	let frameCount = 0;
	let startTime = Date.now();
	let lastState = { ...state };

	const checkAnimationProgress = () => {
		frameCount++;
		const currentState = window.canvasStore?.getState();
		const elapsed = Date.now() - startTime;

		if (currentState) {
			const hasChanged =
				currentState.zoom !== lastState.zoom ||
				currentState.offsetX !== lastState.offsetX ||
				currentState.offsetY !== lastState.offsetY;

			if (hasChanged) {
				console.log(`Frame ${frameCount} (${elapsed}ms):`, {
					zoom: currentState.zoom.toFixed(3),
					offsetX: currentState.offsetX.toFixed(1),
					offsetY: currentState.offsetY.toFixed(1),
					target: {
						zoom: currentState.targetZoom.toFixed(3),
						offsetX: currentState.targetOffsetX.toFixed(1),
						offsetY: currentState.targetOffsetY.toFixed(1)
					}
				});
				lastState = { ...currentState };
			}
		}

		if (frameCount < 100 && elapsed < 5000) {
			requestAnimationFrame(checkAnimationProgress);
		} else {
			console.log(`Animation monitoring stopped after ${frameCount} frames in ${elapsed}ms`);
		}
	};

	// Start monitoring before triggering animation
	requestAnimationFrame(checkAnimationProgress);

	// Test 5: Trigger actual zoom-to-box
	console.log('\n🚀 Test 5: Triggering Zoom-to-Box');
	if (testBox && window.canvasStore?.zoomToBox) {
		console.log(`Triggering zoomToBox for Box ${testBox.id}...`);
		window.canvasStore.zoomToBox(testBox.id, viewportWidth, viewportHeight);

		// Check if state changed immediately
		setTimeout(() => {
			const newState = window.canvasStore.getState();
			console.log('State after zoomToBox call:', {
				targetZoom: newState.targetZoom,
				targetOffsetX: newState.targetOffsetX,
				targetOffsetY: newState.targetOffsetY,
				animationDuration: newState.animationDuration
			});
		}, 10);
	}

	console.log('\n✅ Test suite initiated. Check console for ongoing results...');
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
	window.runAnimationTests = runAnimationTests;
	console.log('Animation test suite loaded. Run runAnimationTests() to start.');
}
