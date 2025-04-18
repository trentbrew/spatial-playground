import { browser } from '$app/environment';

/**
 * Calculates the relative luminance of a given RGB color.
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where R, G, B are linear RGB values (0-1).
 */
function getLuminance(r: number, g: number, b: number): number {
	const a = [r, g, b].map((v) => {
		v /= 255; // Convert 0-255 to 0-1
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	});
	return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Converts a CSS color string (name, hex, rgb, rgba) to an RGB object {r, g, b}.
 * Uses the browser's rendering engine for accurate conversion.
 * Returns null if running server-side or if conversion fails.
 */
function colorStringToRgb(colorString: string): { r: number; g: number; b: number } | null {
	if (!browser) {
		return null; // Cannot compute style server-side
	}
	try {
		// Create a dummy element
		const dummy = document.createElement('div');
		dummy.style.color = colorString;
		document.body.appendChild(dummy);

		// Get the computed style
		const computedColor = window.getComputedStyle(dummy).color;

		// Remove the dummy element
		document.body.removeChild(dummy);

		// Parse the RGB values (e.g., "rgb(255, 165, 0)")
		const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
		if (rgbMatch) {
			return {
				r: parseInt(rgbMatch[1], 10),
				g: parseInt(rgbMatch[2], 10),
				b: parseInt(rgbMatch[3], 10)
			};
		}
	} catch (e) {
		console.error('Failed to parse color string:', colorString, e);
	}
	return null; // Fallback if parsing fails
}

/**
 * Determines whether white or black text provides better contrast against a given background color.
 * @param backgroundColor - A CSS color string (name, hex, rgb, rgba).
 * @returns '#FFFFFF' (white) or '#000000' (black).
 */
export function getTextColorForBackground(backgroundColor: string): '#FFFFFF' | '#000000' {
	const rgb = colorStringToRgb(backgroundColor);

	if (!rgb) {
		// Fallback if color parsing failed (e.g., SSR or invalid color)
		// We could try to guess based on theme, but black is a safer default for light backgrounds
		return '#000000';
	}

	const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

	// WCAG contrast threshold (slightly adjusted common practice)
	// Luminance > 0.5 is generally considered light, needing dark text.
	// Luminance <= 0.5 is generally considered dark, needing light text.
	const LUMINANCE_THRESHOLD = 0.4;

	return luminance > LUMINANCE_THRESHOLD ? '#000000' : '#FFFFFF';
}
