<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	// Use $props rune for props
	let { tag }: { tag: string } = $props();

	const dispatch = createEventDispatcher<{ remove: void }>();
	function handleRemove() {
		dispatch('remove');
	}
</script>

<span class="tag-chip" ondblclick={handleRemove} title="Double-click to remove">#{tag}</span>

<style>
	.tag-chip {
		padding: 4px 8px;
		font-size: 11px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		white-space: nowrap;
		user-select: none;
		cursor: pointer;
		/* border: 1px solid rgba(255, 255, 255, 0.1); */
	}
</style>
