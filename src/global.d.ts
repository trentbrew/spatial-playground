// Declare Svelte file modules
declare module '*.svelte' {
	import { SvelteComponentTyped } from 'svelte';
	export default SvelteComponentTyped<any, any, any>;
}
