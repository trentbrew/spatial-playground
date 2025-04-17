import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [
		svelte({ hot: !process.env.VITEST }), // Need to disable hot mode for Vitest
	],
	test: {
		globals: true, // Use global APIs like describe, it, expect
		environment: 'jsdom', // Simulate a DOM environment for component tests
		include: ['src/**/*.{test,spec}.{js,ts}'], // Where to find tests
		// Optional: Setup file for global mocks or configurations
		// setupFiles: './src/tests/setup.ts',
	},
});
