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
	// 2. Check system preference
	if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}
	// 3. Default to light
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

	// Also listen for system preference changes
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
		// Only update if localStorage isn't explicitly set
		if (!localStorage.getItem('theme')) {
			const newColorScheme: Theme = e.matches ? 'dark' : 'light';
			theme.set(newColorScheme);
			console.log(`System theme changed to: ${newColorScheme}. Updated store.`);
		}
	});
}
