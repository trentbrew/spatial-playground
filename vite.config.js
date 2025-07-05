import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		// Increase chunk size warning limit
		chunkSizeWarningLimit: 1000,
		// Increase memory limit
		maxMemory: 4096
	},
	optimizeDeps: {
		// Exclude heavy dependencies from pre-bundling
		exclude: ['turtle-db']
	},
	define: {
		// Disable turtle-db in production builds
		'process.env.DISABLE_TURTLE_DB': JSON.stringify(process.env.DISABLE_TURTLE_DB || 'false')
	}
});
