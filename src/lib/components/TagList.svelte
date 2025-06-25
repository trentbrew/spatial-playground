<script lang="ts">
	import TagChip from './TagChip.svelte';
	import { createEventDispatcher } from 'svelte';
	import { inputAutoWidth } from '$lib/interactions/inputAutoWidth';

	// Props via rune
	let { tags = [] }: { tags?: string[] } = $props();

	const dispatch = createEventDispatcher<{ add: { tag: string }; remove: { tag: string } }>();

	let newTag = $state('');

	function addTag() {
		console.log('addTag', newTag);
		const tag = newTag.trim();
		if (tag && !tags.includes(tag)) {
			console.log('dispatching add', tag);
			dispatch('add', { tag });
		}
		newTag = '';
	}
</script>

<div class="tag-row">
	<input
		type="text"
		class="tag-input"
		placeholder="#tag"
		bind:value={newTag}
		on:keydown={(e) => {
			if (e.key === 'Enter') addTag();
		}}
		on:blur={addTag}
		use:inputAutoWidth={{ minWidth: 40, maxWidth: 400 }}
	/>
	{#each tags as t (t)}
		<TagChip tag={t} on:remove={() => dispatch('remove', { tag: t })} />
	{/each}
</div>

<style>
	.tag-row {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 4px;
		padding: 0px;
	}

	.tag-input {
		background: rgba(0, 0, 0, 0);
		backdrop-filter: blur(24px) !important;
		border: 1px dashed rgba(255, 255, 255, 0.5);
		border-radius: 4px;
		padding: 0px 8px;
		margin-right: 4px;
		font-size: 11px;
		color: #eaeaea;
		width: 80px;
		outline: none;
	}
	.tag-input::placeholder {
		color: #888;
	}
</style>
