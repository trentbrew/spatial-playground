<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let cursorElement: HTMLDivElement;
	let hoverContext: { type: string; rect: DOMRect } | null = null;
	let duration = 200;
	let transitioning: { position: { x: number; y: number }; time: number; rect: DOMRect } | null =
		null;
	let defaultCursorSize = 20;
	let easeMode = 'default';
	let isDragging = false;

	const mousePosition = { x: 0, y: 0 };
	let cursorPosition = { x: 0, y: 0 };

	const easers = {
		default: (t: number) => 1 - Math.pow(1 - t, 5),
		elastic: (t: number) =>
			t === 0
				? 0
				: t === 1
					? 1
					: Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
		spring: (t: number) => {
			const c1 = 1.70158;
			const c3 = c1 + 1;
			return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
		}
	};

	function ease(t: number) {
		return easeMode in easers ? easers[easeMode as keyof typeof easers](t) : t;
	}

	function setPosition(event: MouseEvent) {
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
	}

	function handleMouseDown(event: MouseEvent) {
		if (event.button === 0) {
			isDragging = true;
		}
	}

	function handleMouseUp(event: MouseEvent) {
		isDragging = false;
	}

	function updateCursor(time: number) {
		if (transitioning && transitioning.time + duration < time) {
			transitioning = null;
		}

		// If dragging, use normal cursor to avoid interference
		if (isDragging) {
			return updateNormalCursor(time);
		}

		if (hoverContext) {
			switch (hoverContext.type) {
				case 'button':
				case 'close-button':
					return updateCursorForButton(time);
				case 'input':
				case 'textarea':
					return updateCursorForInput(time);
				case 'resize':
					return updateCursorForResize(time);
				case 'drag':
					// Don't morph for drag handles, just use normal cursor
					return updateNormalCursor(time);
			}
		}
		return updateNormalCursor(time);
	}

	function tweenCursor({
		x,
		y,
		width,
		height,
		time
	}: {
		x: number;
		y: number;
		width: number;
		height: number;
		time: number;
	}) {
		if (transitioning) {
			const timeFraction = ease((time - transitioning.time) / duration);
			x = lerp(transitioning.position.x, x, timeFraction);
			y = lerp(transitioning.position.y, y, timeFraction);
			width = lerp(transitioning.rect.width, width, timeFraction);
			height = lerp(transitioning.rect.height, height, timeFraction);
		}
		return { x, y, width, height };
	}

	function morphCursor({
		x,
		y,
		width,
		height
	}: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) {
		if (!cursorElement) return;
		const transitionX = x - width / 2;
		const transitionY = y - height / 2;
		cursorElement.style.transform = `translate3d(${transitionX}px, ${transitionY}px, 0)`;
		cursorElement.style.width = `${width}px`;
		cursorElement.style.height = `${height}px`;
		cursorElement.style.borderRadius = `${Math.min(width, height) / 2}px`;
	}

	function lerp(a: number, b: number, n: number) {
		return (1 - n) * a + n * b;
	}

	function offset(difference: number, size: number, shiftFactor = 0.1) {
		const rad = difference / size;
		return ((Math.pow(rad, 3) + rad) / 2) * size * shiftFactor;
	}

	function updateNormalCursor(time: number) {
		const { x, y, width, height } = tweenCursor({
			x: mousePosition.x,
			y: mousePosition.y,
			width: defaultCursorSize,
			height: defaultCursorSize,
			time
		});

		morphCursor({ x, y, width, height });
		return { x, y };
	}

	function updateCursorForButton(time: number) {
		if (!hoverContext) return updateNormalCursor(time);
		const { rect } = hoverContext;
		const halfWidth = rect.width / 2;
		const halfHeight = rect.height / 2;
		const center = {
			x: rect.left + halfWidth,
			y: rect.top + halfHeight
		};

		const { x, y, width, height } = tweenCursor({
			x: center.x + offset(mousePosition.x - center.x, halfWidth),
			y: center.y + offset(mousePosition.y - center.y, halfHeight),
			width: rect.width,
			height: rect.height,
			time
		});

		morphCursor({ x, y, width, height });
		return { x, y };
	}

	function updateCursorForInput(time: number) {
		const { x, y, width, height } = tweenCursor({
			x: mousePosition.x,
			y: mousePosition.y,
			width: 3,
			height: 24,
			time
		});

		morphCursor({ x, y, width, height });
		return { x, y };
	}

	function updateCursorForResize(time: number) {
		const { x, y, width, height } = tweenCursor({
			x: mousePosition.x,
			y: mousePosition.y,
			width: 32,
			height: 32,
			time
		});

		morphCursor({ x, y, width, height });
		return { x, y };
	}

	function updateCursorForDrag(time: number) {
		// Use a subtle increase in size for drag handles
		const { x, y, width, height } = tweenCursor({
			x: mousePosition.x,
			y: mousePosition.y,
			width: 22,
			height: 22,
			time
		});

		morphCursor({ x, y, width, height });
		return { x, y };
	}

	function setHoverContext(el: Element, type: string) {
		hoverContext = {
			type,
			rect: el.getBoundingClientRect()
		};
	}

	function clearHoverContext() {
		hoverContext = null;
	}

	function startTransitioning() {
		if (!cursorElement) return;
		transitioning = {
			position: { ...cursorPosition },
			time: performance.now(),
			rect: cursorElement.getBoundingClientRect()
		};
	}

	function setupHoverListeners() {
		if (!browser) return;

		// Set up listeners for different element types
		const selectors = [
			{ selector: 'button:not([data-cursor]), [role="button"]:not([data-cursor])', type: 'button' },
			{ selector: '[data-cursor="button"]', type: 'button' },
			{
				selector: 'input[type="text"], input[type="email"], input[type="password"], textarea',
				type: 'input'
			},
			{ selector: '[data-cursor="drag"]', type: 'drag' },
			{ selector: '[data-cursor="resize"]', type: 'resize' },
			{ selector: '[data-cursor="close-button"]', type: 'close-button' }
		];

		const cleanup: (() => void)[] = [];

		function addListenersToElements() {
			selectors.forEach(({ selector, type }) => {
				const elements = document.querySelectorAll(selector);
				elements.forEach((element) => {
					// Check if already has listeners
					if (element.hasAttribute('data-cursor-listeners')) return;
					element.setAttribute('data-cursor-listeners', 'true');

					const handleMouseEnter = () => {
						setHoverContext(element, type);
						startTransitioning();
					};
					const handleMouseLeave = () => {
						clearHoverContext();
						startTransitioning();
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

		// Initial setup
		addListenersToElements();

		// Set up MutationObserver to detect new elements
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

		// Add global cursor none style
		const style = document.createElement('style');
		style.textContent = `
			* { cursor: none !important; }
			html, body { cursor: none !important; }
			.drag-handle { cursor: none !important; }
			.resize-handle { cursor: none !important; }
		`;
		document.head.appendChild(style);

		// Set up mouse tracking
		document.addEventListener('mousemove', setPosition);
		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('mouseup', handleMouseUp);

		// Set up hover listeners
		cleanupListeners = setupHoverListeners();

		// Start animation loop
		function update(time: number) {
			cursorPosition = updateCursor(time);
			animationId = requestAnimationFrame(update);
		}
		animationId = requestAnimationFrame(update);

		return () => {
			document.removeEventListener('mousemove', setPosition);
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('mouseup', handleMouseUp);
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
		transition: opacity 0.2s ease;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
	"
></div>

<style>
	.custom-cursor {
		background-color: rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		width: 20px;
		height: 20px;
		transform-origin: center;
		will-change: transform, width, height, border-radius;
		pointer-events: none !important;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
	}
</style>
