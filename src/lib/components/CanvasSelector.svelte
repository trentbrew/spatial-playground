<script lang="ts">
	import { canvasManager } from '$lib/stores/canvasManagerStore.svelte';
	import { fade } from 'svelte/transition';
	import { Plus, Pencil, Copy, Trash2 } from 'lucide-svelte';

	let isExpanded = $state(false);
	let isRenaming = $state<string | null>(null);
	let renameValue = $state('');
	let renameInput: HTMLInputElement;

	const activeCanvas = $derived(canvasManager.activeCanvas);
	const canvases = $derived(canvasManager.canvases);

	function handleRename(canvasId: string) {
		const canvas = canvases.find((c) => c.id === canvasId);
		if (!canvas) return;

		isRenaming = canvasId;
		renameValue = canvas.name;

		// Focus input after DOM update
		setTimeout(() => {
			renameInput?.focus();
			renameInput?.select();
		}, 0);
	}

	function confirmRename() {
		if (isRenaming && renameValue.trim()) {
			canvasManager.renameCanvas(isRenaming, renameValue.trim());
		}
		isRenaming = null;
		renameValue = '';
	}

	function cancelRename() {
		isRenaming = null;
		renameValue = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			confirmRename();
		} else if (e.key === 'Escape') {
			cancelRename();
		}
	}

	async function createNewCanvas() {
		isExpanded = false;
		await canvasManager.createCanvas();
	}

	async function switchCanvas(canvasId: string) {
		if (canvasId !== canvasManager.activeCanvasId) {
			isExpanded = false;
			await canvasManager.switchToCanvas(canvasId);
		}
	}

	function duplicateCanvas(canvasId: string) {
		const newId = canvasManager.duplicateCanvas(canvasId);
		if (newId) {
			canvasManager.switchToCanvas(newId);
		}
	}

	// Close dropdown when clicking outside
	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.canvas-selector')) {
			isExpanded = false;
		}
	}

	$effect(() => {
		if (isExpanded) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="canvas-selector" class:expanded={isExpanded}>
	<button
		class="selector-toggle"
		onclick={() => (isExpanded = !isExpanded)}
		title="Switch between canvases"
	>
		<span class="canvas-name">{activeCanvas?.name || 'Loading...'}</span>
		<span class="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
	</button>

	{#if isExpanded}
		<div class="selector-content" transition:fade={{ duration: 150 }}>
			<div class="canvas-list">
				{#each canvases as canvas (canvas.id)}
					<div
						class="canvas-item"
						class:active={canvas.id === canvasManager.activeCanvasId}
						class:default={canvas.isDefault}
					>
						{#if isRenaming === canvas.id}
							<input
								bind:this={renameInput}
								bind:value={renameValue}
								onkeydown={handleKeydown}
								onblur={confirmRename}
								class="rename-input"
								placeholder="Canvas name..."
							/>
						{:else}
							<button
								class="canvas-button"
								onclick={() => switchCanvas(canvas.id)}
								title={canvas.name}
							>
								{#if canvas.isDefault}
									<span class="icon">🎨</span>
								{/if}
								<span class="name">{canvas.name}</span>
							</button>
							<div class="canvas-actions">
								{#if !canvas.isDefault}
									<button
										class="action-button"
										onclick={() => handleRename(canvas.id)}
										title="Rename canvas"
									>
										<Pencil size={14} />
									</button>
									<button
										class="action-button"
										onclick={() => duplicateCanvas(canvas.id)}
										title="Duplicate canvas"
									>
										<Copy size={14} />
									</button>
									<button
										class="action-button delete"
										onclick={() => canvasManager.deleteCanvas(canvas.id)}
										title="Delete canvas"
									>
										<Trash2 size={14} />
									</button>
								{:else}
									<button
										class="action-button"
										onclick={() => duplicateCanvas(canvas.id)}
										title="Duplicate canvas"
									>
										<Copy size={14} />
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="selector-footer">
				<button class="new-canvas-button" onclick={createNewCanvas}>
					<span class="icon">+</span>
					New Canvas
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.canvas-selector {
		position: fixed;
		top: 20px;
		left: 20px;
		z-index: 200;
		background: rgba(0, 0, 0, 0.85);
		color: white;
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-width: 250px;
	}

	.selector-toggle {
		width: 100%;
		background: transparent;
		border: none;
		color: white;
		padding: 12px 16px;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		border-radius: 8px;
		transition: background-color 0.2s;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.selector-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.canvas-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.toggle-icon {
		font-size: 10px;
		opacity: 0.7;
		flex-shrink: 0;
	}

	.selector-content {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		max-height: 400px;
		overflow-y: auto;
	}

	.canvas-list {
		padding: 8px;
	}

	.canvas-item {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
		border-radius: 6px;
		overflow: hidden;
	}

	.canvas-item.active {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.canvas-button {
		flex: 1;
		background: transparent;
		border: none;
		color: white;
		padding: 8px 12px;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		transition: background-color 0.2s;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.canvas-button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.canvas-button .icon {
		flex-shrink: 0;
	}

	.canvas-button .name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.canvas-actions {
		display: flex;
		gap: 2px;
		padding-right: 4px;
	}

	.action-button {
		background: transparent;
		border: none;
		color: white;
		padding: 4px 8px;
		cursor: pointer;
		font-size: 12px;
		border-radius: 4px;
		transition: all 0.2s;
		opacity: 0.6;
	}

	.action-button:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
	}

	.action-button.delete:hover {
		background: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	.rename-input {
		flex: 1;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 6px 10px;
		font-family: inherit;
		font-size: inherit;
		border-radius: 4px;
		margin: 2px 4px;
		outline: none;
	}

	.rename-input:focus {
		border-color: #007bff;
		background: rgba(255, 255, 255, 0.15);
	}

	.selector-footer {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding: 8px;
	}

	.new-canvas-button {
		width: 100%;
		background: rgba(0, 123, 255, 0.2);
		border: 1px solid rgba(0, 123, 255, 0.4);
		color: #007bff;
		padding: 8px 16px;
		text-align: center;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		border-radius: 6px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-weight: 500;
	}

	.new-canvas-button:hover {
		background: rgba(0, 123, 255, 0.3);
		border-color: #007bff;
		transform: translateY(-1px);
	}

	.new-canvas-button .icon {
		font-size: 14px;
	}

	/* Scrollbar styling */
	.selector-content::-webkit-scrollbar {
		width: 6px;
	}

	.selector-content::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	.selector-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.selector-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
