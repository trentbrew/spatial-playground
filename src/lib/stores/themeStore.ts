import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

// Function to get the initial theme
function getInitialTheme(): Theme {
	if (!browser) {
		return 'light'; // Default for SSR
	}
	// 1. Check localStorage
	const storedTheme = localStorage.getItem('theme') as Theme | null;
	if (storedTheme) {
		return storedTheme;
	}
	// 2. Always default to light mode (ignoring system preference)
	return 'light';
}

// Create the writable store
const initialTheme = getInitialTheme();
export const theme = writable<Theme>(initialTheme);

// Subscribe to store changes and update localStorage / root element attribute
if (browser) {
	theme.subscribe((value) => {
		localStorage.setItem('theme', value);
		// Update root HTML element attribute for global CSS targeting
		document.documentElement.setAttribute('data-theme', value);
		console.log(`Theme changed to: ${value}. Updated localStorage and <html> attribute.`);
	});

	// Initial set on load
	document.documentElement.setAttribute('data-theme', initialTheme);
}
