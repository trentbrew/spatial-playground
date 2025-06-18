import type { AppBoxState } from '$lib/canvasState';
import { getParallaxFactor, getIntrinsicScaleFactor } from './depth';

interface ViewportBounds {
	width: number;
	height: number;
}

interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

/**
 * Converts world coordinates to screen coordinates accounting for zoom, offset, and parallax
 */
function worldToScreen(
	worldX: number,
	worldY: number,
	worldWidth: number,
	worldHeight: number,
	z: number,
	zoom: number,
	offsetX: number,
	offsetY: number,
	viewportWidth: number,
	viewportHeight: number
): ScreenRect {
	const parallaxFactor = getParallaxFactor(z);
	const intrinsicScale = getIntrinsicScaleFactor(z);

	// Apply parallax to the offset (centered parallax)
	const centerX = viewportWidth / 2;
	const centerY = viewportHeight / 2;
	const parallaxOffsetX = offsetX + (offsetX - centerX) * (parallaxFactor - 1);
	const parallaxOffsetY = offsetY + (offsetY - centerY) * (parallaxFactor - 1);

	// Calculate effective scale
	const effectiveScale = zoom * intrinsicScale;

	// Convert to screen coordinates
	const screenX = worldX * effectiveScale + parallaxOffsetX;
	const screenY = worldY * effectiveScale + parallaxOffsetY;
	const screenWidth = worldWidth * effectiveScale;
	const screenHeight = worldHeight * effectiveScale;

	return {
		left: screenX,
		top: screenY,
		right: screenX + screenWidth,
		bottom: screenY + screenHeight,
		width: screenWidth,
		height: screenHeight
	};
}

/**
 * Check if two rectangles overlap
 */
function rectsOverlap(rect1: ScreenRect, rect2: ScreenRect): boolean {
	return !(
		rect1.right <= rect2.left ||
		rect1.left >= rect2.right ||
		rect1.bottom <= rect2.top ||
		rect1.top >= rect2.bottom
	);
}

/**
 * Calculate the overlap area between two rectangles
 */
function calculateOverlapArea(rect1: ScreenRect, rect2: ScreenRect): number {
	if (!rectsOverlap(rect1, rect2)) return 0;

	const overlapWidth = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
	const overlapHeight = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);

	return overlapWidth * overlapHeight;
}

/**
 * Calculate what percentage of the target rect is obscured by the obstruction rect
 */
function calculateObscurationPercentage(
	targetRect: ScreenRect,
	obstructionRect: ScreenRect
): number {
	const overlapArea = calculateOverlapArea(targetRect, obstructionRect);
	const targetArea = targetRect.width * targetRect.height;

	if (targetArea === 0) return 0;
	return (overlapArea / targetArea) * 100;
}

/**
 * Find the best direction to move the camera to reduce obstruction
 */
function calculateAvoidanceVector(
	targetRect: ScreenRect,
	obstructions: ScreenRect[],
	viewportBounds: ViewportBounds
): { x: number; y: number; totalObscuration: number } {
	const moveDistance = 100; // pixels to test movement
	const directions = [
		{ x: moveDistance, y: 0, name: 'right' },
		{ x: -moveDistance, y: 0, name: 'left' },
		{ x: 0, y: moveDistance, name: 'down' },
		{ x: 0, y: -moveDistance, name: 'up' },
		{ x: moveDistance * 0.7, y: moveDistance * 0.7, name: 'down-right' },
		{ x: -moveDistance * 0.7, y: moveDistance * 0.7, name: 'down-left' },
		{ x: moveDistance * 0.7, y: -moveDistance * 0.7, name: 'up-right' },
		{ x: -moveDistance * 0.7, y: -moveDistance * 0.7, name: 'up-left' }
	];

	let bestDirection = { x: 0, y: 0 };
	let lowestObscuration = Infinity;

	for (const direction of directions) {
		// Simulate moving the target in this direction
		const movedTarget: ScreenRect = {
			left: targetRect.left + direction.x,
			top: targetRect.top + direction.y,
			right: targetRect.right + direction.x,
			bottom: targetRect.bottom + direction.y,
			width: targetRect.width,
			height: targetRect.height
		};

		// Check if moved target would still be visible in viewport
		const visibleInViewport =
			movedTarget.right > 0 &&
			movedTarget.left < viewportBounds.width &&
			movedTarget.bottom > 0 &&
			movedTarget.top < viewportBounds.height;

		if (!visibleInViewport) continue;

		// Calculate total obscuration in this position
		let totalObscuration = 0;
		for (const obstruction of obstructions) {
			totalObscuration += calculateObscurationPercentage(movedTarget, obstruction);
		}

		if (totalObscuration < lowestObscuration) {
			lowestObscuration = totalObscuration;
			bestDirection = direction;
		}
	}

	return {
		x: bestDirection.x,
		y: bestDirection.y,
		totalObscuration: lowestObscuration
	};
}

/**
 * Detect if a focused node is obstructed and calculate avoidance strategy
 */
export function detectObstruction(
	focusedBox: AppBoxState,
	allBoxes: AppBoxState[],
	zoom: number,
	offsetX: number,
	offsetY: number,
	viewportWidth: number,
	viewportHeight: number
): {
	isObstructed: boolean;
	obstructionPercentage: number;
	avoidanceVector: { x: number; y: number } | null;
	obstructingBoxes: AppBoxState[];
} {
	// Convert focused box to screen coordinates
	const focusedScreenRect = worldToScreen(
		focusedBox.x,
		focusedBox.y,
		focusedBox.width,
		focusedBox.height,
		focusedBox.z,
		zoom,
		offsetX,
		offsetY,
		viewportWidth,
		viewportHeight
	);

	// Find boxes that are in front of the focused box (higher z-index)
	const foregroundBoxes = allBoxes.filter(
		(box) => box.id !== focusedBox.id && box.z > focusedBox.z
	);

	if (foregroundBoxes.length === 0) {
		return {
			isObstructed: false,
			obstructionPercentage: 0,
			avoidanceVector: null,
			obstructingBoxes: []
		};
	}

	// Convert foreground boxes to screen coordinates
	const foregroundScreenRects = foregroundBoxes.map((box) => ({
		box,
		rect: worldToScreen(
			box.x,
			box.y,
			box.width,
			box.height,
			box.z,
			zoom,
			offsetX,
			offsetY,
			viewportWidth,
			viewportHeight
		)
	}));

	// Calculate total obstruction
	let totalObscuration = 0;
	const obstructingBoxes: AppBoxState[] = [];
	const obstructingRects: ScreenRect[] = [];

	for (const { box, rect } of foregroundScreenRects) {
		const obscuration = calculateObscurationPercentage(focusedScreenRect, rect);
		if (obscuration > 0) {
			totalObscuration += obscuration;
			obstructingBoxes.push(box);
			obstructingRects.push(rect);
		}
	}

	// Cap total obscuration at 100%
	totalObscuration = Math.min(totalObscuration, 100);

	// Consider it obstructed if more than 15% is covered
	const isObstructed = totalObscuration > 15;

	let avoidanceVector = null;
	if (isObstructed && obstructingRects.length > 0) {
		const avoidance = calculateAvoidanceVector(focusedScreenRect, obstructingRects, {
			width: viewportWidth,
			height: viewportHeight
		});

		// Only suggest avoidance if it significantly reduces obstruction
		if (avoidance.totalObscuration < totalObscuration * 0.7) {
			avoidanceVector = { x: avoidance.x, y: avoidance.y };
		}
	}

	return {
		isObstructed,
		obstructionPercentage: totalObscuration,
		avoidanceVector,
		obstructingBoxes
	};
}
