<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';

	let cursorElement: HTMLDivElement;
	let hoverContext: { type: string; rect: DOMRect } | null = null;
	let defaultCursorSize = 20;
	let isDragging = false;
	let isVisible = true;
	let isMouseDown = false; // Track mousedown for scaling

	const mousePosition = { x: 0, y: 0 };
	let cursorPosition = { x: 0, y: 0 };
	let lastMousePosition = { x: 0, y: 0 };

	// Enhanced spring state with rotation and more properties
	let spring = {
		x: 0,
		y: 0,
		width: defaultCursorSize,
		height: defaultCursorSize,
		rotation: 0,
		velocityX: 0,
		velocityY: 0,
		velocityW: 0,
		velocityH: 0,
		velocityR: 0
	};

	// Enhanced spring physics parameters with different rates for different properties
	const PHYSICS = {
		position: { stiffness: 0.18, damping: 0.75, mass: 1 },
		size: { stiffness: 0.22, damping: 0.8, mass: 1 },
		rotation: { stiffness: 0.15, damping: 0.85, mass: 1 }
	};

	// Enhanced squish parameters
	const SQUISH = {
		maxAmount: 0.25,
		velocityMultiplier: 0.15,
		rotationInfluence: 0.3
	};

	// Reactive state for focus detection
	const zoomedBoxId = $derived(canvasStore.zoomedBoxId);

	// Mouse velocity calculation for enhanced effects
	let mouseVelocity = { x: 0, y: 0, magnitude: 0 };

	function updateMouseVelocity() {
		const deltaX = mousePosition.x - lastMousePosition.x;
		const deltaY = mousePosition.y - lastMousePosition.y;

		// Smooth velocity with exponential moving average
		const smoothing = 0.7;
		mouseVelocity.x = mouseVelocity.x * smoothing + deltaX * (1 - smoothing);
		mouseVelocity.y = mouseVelocity.y * smoothing + deltaY * (1 - smoothing);
		mouseVelocity.magnitude = Math.sqrt(mouseVelocity.x ** 2 + mouseVelocity.y ** 2);

		lastMousePosition.x = mousePosition.x;
		lastMousePosition.y = mousePosition.y;
	}

	function setPosition(event: MouseEvent) {
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
		updateMouseVelocity();

		// Show cursor if it was hidden
		if (!isVisible) {
			isVisible = true;
		}
	}

	function handleMouseDown(event: MouseEvent) {
		if (event.button === 0) {
			isDragging = true;
			isMouseDown = true;
		}
	}

	function handleMouseUp(event: MouseEvent) {
		isDragging = false;
		isMouseDown = false;
	}

	function handleMouseLeave() {
		isVisible = false;
		isMouseDown = false;
	}

	function handleMouseEnter() {
		isVisible = true;
	}

	function getCursorTarget() {
		// Scale down the cursor on mousedown
		const scaleDown = isMouseDown ? 0.5 : 1;

		// Enhanced dragging state with slight size increase
		if (isDragging) {
			return {
				x: mousePosition.x,
				y: mousePosition.y,
				width: defaultCursorSize * 1.1 * scaleDown,
				height: defaultCursorSize * 1.1 * scaleDown,
				rotation: 0
			};
		}

		if (hoverContext) {
			switch (hoverContext.type) {
				case 'ignore':
					return {
						x: mousePosition.x,
						y: mousePosition.y,
						width: defaultCursorSize * scaleDown,
						height: defaultCursorSize * scaleDown,
						rotation: 0
					};
				case 'button':
				case 'close-button': {
					const { rect } = hoverContext;
					const halfWidth = rect.width / 2;
					const halfHeight = rect.height / 2;
					const center = {
						x: rect.left + halfWidth,
						y: rect.top + halfHeight
					};

					// Enhanced magnetic effect with rotation
					const magneticStrength = 0.15;
					const offsetX = offset(mousePosition.x - center.x, halfWidth, magneticStrength);
					const offsetY = offset(mousePosition.y - center.y, halfHeight, magneticStrength);

					return {
						x: center.x + offsetX,
						y: center.y + offsetY,
						width: rect.width * 1.05 * scaleDown,
						height: rect.height * 1.05 * scaleDown,
						rotation: (offsetX + offsetY) * 0.1
					};
				}
				case 'input':
				case 'textarea':
					return {
						x: mousePosition.x,
						y: mousePosition.y,
						width: 3 * scaleDown,
						height: 28 * scaleDown,
						rotation: 0
					};
				case 'resize': {
					// Rotate based on position for resize handles
					const angle = Math.atan2(mouseVelocity.y, mouseVelocity.x) * (180 / Math.PI);
					return {
						x: mousePosition.x,
						y: mousePosition.y,
						width: 36 * scaleDown,
						height: 36 * scaleDown,
						rotation: angle
					};
				}
				case 'drag':
					return {
						x: mousePosition.x,
						y: mousePosition.y,
						width: 26 * scaleDown,
						height: 26 * scaleDown,
						rotation: mouseVelocity.magnitude * 2
					};
				case 'box': {
					if (zoomedBoxId !== null) {
						return {
							x: mousePosition.x,
							y: mousePosition.y,
							width: defaultCursorSize * scaleDown,
							height: defaultCursorSize * scaleDown,
							rotation: 0
						};
					}
					const { rect } = hoverContext;
					const padding = 8;
					const width = (rect.width + padding * 2) * scaleDown;
					const height = (rect.height + padding * 2) * scaleDown;
					const center = {
						x: rect.left + rect.width / 2,
						y: rect.top + rect.height / 2
					};
					return {
						x: center.x,
						y: center.y,
						width,
						height,
						rotation: 0
					};
				}
			}
		}

		return {
			x: mousePosition.x,
			y: mousePosition.y,
			width: defaultCursorSize * scaleDown,
			height: defaultCursorSize * scaleDown,
			rotation: 0
		};
	}

	function offset(difference: number, size: number, shiftFactor = 0.1) {
		const rad = difference / size;
		return ((Math.pow(rad, 3) + rad) / 2) * size * shiftFactor;
	}

	// Enhanced morphCursor with rotation and better squish
	function morphCursor({
		x,
		y,
		width,
		height,
		rotation = 0,
		squishX = 0,
		squishY = 0
	}: {
		x: number;
		y: number;
		width: number;
		height: number;
		rotation?: number;
		squishX?: number;
		squishY?: number;
	}) {
		if (!cursorElement) return;

		const transitionX = x - width / 2;
		const transitionY = y - height / 2;

		// Enhanced squish with rotation influence
		const maxSquish = SQUISH.maxAmount;
		const rotationSquish = Math.sin((rotation * Math.PI) / 180) * SQUISH.rotationInfluence;

		const sx = 1 + Math.max(-maxSquish, Math.min(maxSquish, squishX + rotationSquish));
		const sy = 1 - Math.max(-maxSquish, Math.min(maxSquish, squishY - rotationSquish));

		// Apply transforms
		cursorElement.style.transform =
			`translate3d(${transitionX}px, ${transitionY}px, 0) ` +
			`scale(${sx}, ${sy}) ` +
			`rotate(${rotation}deg)`;

		cursorElement.style.width = `${width}px`;
		cursorElement.style.height = `${height}px`;
		cursorElement.style.opacity = isVisible ? '1' : '0';

		// Enhanced border radius logic
		if (!hoverContext || hoverContext.type !== 'box') {
			const radius = Math.min(width, height) / 2;
			cursorElement.style.borderRadius = `${radius}px`;
		}
	}

	function updateCursorSpring(time: number) {
		const target = getCursorTarget();

		// Enhanced spring physics with different parameters for different properties
		const updateSpringProperty = (
			current: number,
			targetVal: number,
			velocity: number,
			physics: typeof PHYSICS.position
		) => {
			const delta = targetVal - current;
			const acceleration = (physics.stiffness * delta - physics.damping * velocity) / physics.mass;
			return {
				newVelocity: velocity + acceleration,
				newValue: current + velocity + acceleration
			};
		};

		// Update position
		const posX = updateSpringProperty(spring.x, target.x, spring.velocityX, PHYSICS.position);
		const posY = updateSpringProperty(spring.y, target.y, spring.velocityY, PHYSICS.position);

		// Update size
		const sizeW = updateSpringProperty(spring.width, target.width, spring.velocityW, PHYSICS.size);
		const sizeH = updateSpringProperty(
			spring.height,
			target.height,
			spring.velocityH,
			PHYSICS.size
		);

		// Update rotation
		const rot = updateSpringProperty(
			spring.rotation,
			target.rotation || 0,
			spring.velocityR,
			PHYSICS.rotation
		);

		// Apply updates
		spring.velocityX = posX.newVelocity;
		spring.velocityY = posY.newVelocity;
		spring.velocityW = sizeW.newVelocity;
		spring.velocityH = sizeH.newVelocity;
		spring.velocityR = rot.newVelocity;

		spring.x = posX.newValue;
		spring.y = posY.newValue;
		spring.width = sizeW.newValue;
		spring.height = sizeH.newValue;
		spring.rotation = rot.newValue;

		// Enhanced squish calculation with velocity and acceleration
		const velocityMag = Math.sqrt(spring.velocityX ** 2 + spring.velocityY ** 2);
		const accelerationMag = Math.sqrt(
			(spring.velocityX - mouseVelocity.x) ** 2 + (spring.velocityY - mouseVelocity.y) ** 2
		);

		let normVX = 0,
			normVY = 0;
		if (velocityMag > 0.001) {
			normVX = spring.velocityX / velocityMag;
			normVY = spring.velocityY / velocityMag;
		}

		// Enhanced squish with acceleration influence
		const baseSquish = Math.min(velocityMag * SQUISH.velocityMultiplier, SQUISH.maxAmount);
		const accelSquish = Math.min(accelerationMag * 0.05, 0.1);
		const totalSquish = baseSquish + accelSquish;

		const squishX = normVX * totalSquish;
		const squishY = normVY * totalSquish;

		morphCursor({
			x: spring.x,
			y: spring.y,
			width: spring.width,
			height: spring.height,
			rotation: spring.rotation,
			squishX,
			squishY
		});

		cursorPosition = { x: spring.x, y: spring.y };

		// Enhanced styling for different contexts
		if (hoverContext && cursorElement) {
			switch (hoverContext.type) {
				case 'box':
					cursorElement.style.backgroundColor = 'transparent';
					cursorElement.style.border = '2px solid rgba(255,255,255,0.9)';
					cursorElement.style.boxShadow =
						'0 0 12px rgba(255,255,255,0.5), inset 0 0 12px rgba(255,255,255,0.2)';
					cursorElement.style.borderRadius = '24px';
					cursorElement.style.zIndex = '0';
					break;
				case 'button':
				case 'close-button':
					cursorElement.style.backgroundColor = 'rgba(255,255,255,0.9)';
					cursorElement.style.border = '1px solid rgba(255,255,255,0.5)';
					cursorElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
					cursorElement.style.zIndex = '999999';
					break;
				case 'resize':
					// cursorElement.style.backgroundColor = 'rgba(255,100,100,0.8)';
					cursorElement.style.border = '2px solid rgba(255,255,255,0.8)';
					// cursorElement.style.boxShadow = '0 0 8px rgba(255,100,100,0.6)';
					cursorElement.style.zIndex = '999999';
					break;
				case 'drag':
					cursorElement.style.backgroundColor = 'rgba(100,150,255,0.8)';
					cursorElement.style.border = '2px solid rgba(255,255,255,0.8)';
					cursorElement.style.boxShadow = '0 0 8px rgba(100,150,255,0.6)';
					cursorElement.style.zIndex = '999999';
					break;
				default:
					cursorElement.style.border = 'none';
					cursorElement.style.boxShadow = 'none';
					cursorElement.style.backgroundColor = 'rgba(255,255,255,0.8)';
					cursorElement.style.zIndex = '999999';
			}
		} else if (cursorElement) {
			cursorElement.style.border = 'none';
			cursorElement.style.boxShadow = 'none';
			cursorElement.style.backgroundColor = 'rgba(255,255,255,0.8)';
			cursorElement.style.zIndex = '999999';
		}
	}

	function setHoverContext(el: Element, type: string) {
		// When hovering an "ignore" element, revert to the default cursor by clearing the context.
		if (type === 'ignore') {
			clearHoverContext();
			return;
		}

		hoverContext = {
			type,
			rect: el.getBoundingClientRect()
		};
	}

	function clearHoverContext() {
		hoverContext = null;
	}

	function setupHoverListeners() {
		if (!browser) return;

		const selectors = [
			{ selector: 'button:not([data-cursor]), [role="button"]:not([data-cursor])', type: 'button' },
			{ selector: '[data-cursor="button"]', type: 'button' },
			{
				selector: 'input[type="text"], input[type="email"], input[type="password"], textarea',
				type: 'input'
			},
			{ selector: '[data-cursor="drag"]', type: 'drag' },
			{ selector: '[data-cursor="resize"]', type: 'resize' },
			{ selector: '[data-cursor="close-button"]', type: 'close-button' },
			{ selector: '[data-cursor="ignore"]', type: 'ignore' },
			{ selector: '.iframe-container', type: 'ignore' },
			{ selector: '.box', type: 'box' }
		];

		const cleanup: (() => void)[] = [];

		function addListenersToElements() {
			selectors.forEach(({ selector, type }) => {
				const elements = document.querySelectorAll(selector);
				elements.forEach((element) => {
					if (element.hasAttribute('data-cursor-listeners')) return;
					element.setAttribute('data-cursor-listeners', 'true');

					const handleMouseEnter = () => {
						setHoverContext(element, type);
					};
					const handleMouseLeave = () => {
						clearHoverContext();
					};

					element.addEventListener('mouseenter', handleMouseEnter);
					element.addEventListener('mouseleave', handleMouseLeave);

					cleanup.push(() => {
						element.removeEventListener('mouseenter', handleMouseEnter);
						element.removeEventListener('mouseleave', handleMouseLeave);
						element.removeAttribute('data-cursor-listeners');
					});
				});
			});
		}

		addListenersToElements();

		const observer = new MutationObserver(() => {
			addListenersToElements();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true
		});

		cleanup.push(() => observer.disconnect());
		return () => cleanup.forEach((fn) => fn());
	}

	let animationId: number;
	let cleanupListeners: (() => void) | undefined;

	onMount(() => {
		if (!browser) return;

		const style = document.createElement('style');
		style.textContent = `
			* { cursor: none !important; }
			html, body { cursor: none !important; }
			.drag-handle { cursor: none !important; }
			.resize-handle { cursor: none !important; }
		`;
		document.head.appendChild(style);

		document.addEventListener('mousemove', setPosition);
		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mouseleave', handleMouseLeave);
		document.addEventListener('mouseenter', handleMouseEnter);

		cleanupListeners = setupHoverListeners();

		function update(time: number) {
			updateCursorSpring(time);
			animationId = requestAnimationFrame(update);
		}
		animationId = requestAnimationFrame(update);

		return () => {
			document.removeEventListener('mousemove', setPosition);
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('mouseleave', handleMouseLeave);
			document.removeEventListener('mouseenter', handleMouseEnter);
			cancelAnimationFrame(animationId);
			cleanupListeners?.();
			style.remove();
		};
	});

	onDestroy(() => {
		if (browser) {
			document.removeEventListener('mousemove', setPosition);
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('mouseleave', handleMouseLeave);
			document.removeEventListener('mouseenter', handleMouseEnter);
			cancelAnimationFrame(animationId);
			cleanupListeners?.();
		}
	});
</script>

<div
	bind:this={cursorElement}
	class="custom-cursor"
	style="
		position: fixed;
		pointer-events: none;
		z-index: 999999;
		mix-blend-mode: difference;
		transition: opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
	"
></div>

<style>
	.custom-cursor {
		background-color: rgba(255, 255, 255, 0.8);
		border-radius: 20px !important;
		width: 20px;
		height: 20px;
		transform-origin: center;
		will-change: transform, width, height, border-radius, box-shadow, opacity;
		pointer-events: none !important;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		transition:
			box-shadow 0.2s cubic-bezier(0.4, 1.6, 0.6, 1),
			border 0.2s cubic-bezier(0.4, 1.6, 0.6, 1),
			background-color 0.2s cubic-bezier(0.4, 1.6, 0.6, 1);
	}
</style>
