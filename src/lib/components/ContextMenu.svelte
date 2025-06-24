<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import type { ContextMenuItem } from '$lib/stores/contextMenuStore.svelte';

	// Props

	interface ContextMenuProps {
		x: number;
		y: number;
		worldX?: number;
		worldY?: number;
		zoom: number;
		offsetX: number;
		offsetY: number;
		items: ContextMenuItem[];
		targetId?: number; // ID of the box this menu is for
		visible: boolean;
	}

	let {
		x = 0,
		y = 0,
		worldX,
		worldY,
		zoom = 1,
		offsetX = 0,
		offsetY = 0,
		items = [],
		targetId,
		visible = false
	}: ContextMenuProps = $props();

	const dispatch = createEventDispatcher<{
		select: { itemId: string; targetId?: number };
		close: void;
	}>();

	let menuElement = $state<HTMLDivElement>();
	let menuWidth = $state(0);
	let menuHeight = $state(0);

	// Calculate screen position from world coordinates if available
	const screenX = $derived(
		worldX !== undefined && worldY !== undefined ? worldX * zoom + offsetX : x
	);

	const screenY = $derived(
		worldX !== undefined && worldY !== undefined ? worldY * zoom + offsetY : y
	);

	// Reactive position calculations to keep menu in viewport
	const adjustedX = $derived(
		browser ? Math.min(Math.max(screenX, 10), window.innerWidth - menuWidth - 10) : screenX
	);
	const adjustedY = $derived(
		browser ? Math.min(Math.max(screenY, 10), window.innerHeight - menuHeight - 10) : screenY
	);

	function handleItemClick(item: ContextMenuItem) {
		if (item.disabled || item.separator) return;

		dispatch('select', { itemId: item.id, targetId });
		dispatch('close');
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			dispatch('close');
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (menuElement && !menuElement.contains(event.target as Node)) {
			dispatch('close');
		}
	}

	onMount(() => {
		if (visible) {
			// Calculate menu dimensions
			menuWidth = menuElement?.offsetWidth || 0;
			menuHeight = menuElement?.offsetHeight || 0;

			// Add global event listeners
			document.addEventListener('keydown', handleKeyDown);
			document.addEventListener('click', handleClickOutside);

			// Focus the menu for keyboard navigation
			menuElement?.focus();

			return () => {
				document.removeEventListener('keydown', handleKeyDown);
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});
</script>

{#if visible}
	<div
		bind:this={menuElement}
		class="context-menu"
		style:left="{adjustedX}px"
		style:top="{adjustedY}px"
		tabindex="-1"
		role="menu"
		aria-label="Context menu"
	>
		{#each items as item (item.id)}
			{#if item.separator}
				<div class="menu-separator" role="separator"></div>
			{:else}
				<button
					class="menu-item"
					class:disabled={item.disabled}
					disabled={item.disabled}
					data-cursor="button"
					onclick={() => handleItemClick(item)}
					role="menuitem"
				>
					{#if item.icon}
						<span class="menu-icon">
							{#if typeof item.icon === 'string'}
								{item.icon}
							{:else}
								<item.icon size={16} />
							{/if}
						</span>
					{/if}
					<span class="menu-label">{item.label}</span>
					{#if item.submenu}
						<span class="menu-arrow">▶</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.context-menu {
		position: fixed;
		z-index: 10000; /* Above everything else */
		background: #181818;
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 4px;
		min-width: 180px;
		box-shadow:
			0 10px 25px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(255, 255, 255, 0.05);
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 14px;
		color: #e0e0e0;
		outline: none;
		animation: contextMenuAppear 0.15s ease-out;
	}

	@keyframes contextMenuAppear {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-5px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.menu-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		color: inherit;
		font-size: inherit;
		text-align: left;
		transition: background-color 0.1s ease;
	}

	.menu-item:hover:not(.disabled) {
		/* background: rgba(74, 144, 226, 0.2); */
		color: #ffffff;
	}

	.menu-item:focus:not(.disabled) {
		/* background: rgba(74, 144, 226, 0.3); */
		color: #ffffff;
		outline: none;
	}

	.menu-item.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.menu-icon {
		margin-right: 8px;
		font-size: 16px;
		width: 20px;
		text-align: center;
	}

	.menu-label {
		flex: 1;
	}

	.menu-arrow {
		margin-left: 8px;
		font-size: 12px;
		opacity: 0.7;
	}

	.menu-separator {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 4px 8px;
	}
</style>
