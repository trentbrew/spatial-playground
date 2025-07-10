<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import { canvasStore } from '$lib/stores/canvasStore.svelte';
	import { contextMenuStore } from '$lib/stores/contextMenuStore.svelte';
	import { canvasManager } from '$lib/stores/canvasManagerStore.svelte';
	import { searchStore, type SearchResult } from '$lib/stores/searchStore.svelte';
	import {
		Search,
		StickyNote,
		Code,
		Image,
		Globe,
		FileText,
		Music,
		FileType,
		PenTool,
		Zap,
		Target,
		ZoomIn,
		ZoomOut,
		Shuffle,
		Download,
		Save,
		Maximize2,
		ArrowRight,
		Hash,
		Clock,
		TerminalSquare
	} from 'lucide-svelte';

	// Component state
	let isOpen = $state(false);
	let searchQuery = $state('');
	let selectedIndex = $state(0);
	let searchInput: HTMLInputElement;
	let paletteElement: HTMLDivElement;

	// Command categories
	interface Command {
		id: string;
		label: string;
		description?: string;
		icon: any;
		category: string;
		keywords: string[];
		action: () => void;
		data?: any;
	}

	// Get current viewport info
	let viewportWidth = $state(0);
	let viewportHeight = $state(0);

	onMount(() => {
		if (browser) {
			viewportWidth = window.innerWidth;
			viewportHeight = window.innerHeight;

			const updateViewport = () => {
				viewportWidth = window.innerWidth;
				viewportHeight = window.innerHeight;
			};

			window.addEventListener('resize', updateViewport);
			return () => window.removeEventListener('resize', updateViewport);
		}
	});

	// Get center point for creating new nodes
	function getViewportCenter(): { x: number; y: number } {
		// Convert screen center to world coordinates
		const screenCenterX = viewportWidth / 2;
		const screenCenterY = viewportHeight / 2;

		const worldX = (screenCenterX - canvasStore.offsetX) / canvasStore.zoom;
		const worldY = (screenCenterY - canvasStore.offsetY) / canvasStore.zoom;

		return { x: worldX, y: worldY };
	}

	// Generate dynamic commands
	const staticCommands: Command[] = [
		// Create commands
		{
			id: 'create-note',
			label: 'Create Note',
			description: 'Add a new sticky note',
			icon: StickyNote,
			category: 'Create',
			keywords: ['create', 'new', 'note', 'sticky', 'text'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('note', center.x, center.y);
			}
		},
		{
			id: 'create-markdown',
			label: 'Create Markdown',
			description: 'Add a new markdown document',
			icon: FileType,
			category: 'Create',
			keywords: ['create', 'new', 'markdown', 'md', 'document', 'text'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('markdown', center.x, center.y);
			}
		},
		{
			id: 'create-code',
			label: 'Create Code Block',
			description: 'Add a new code editor',
			icon: Code,
			category: 'Create',
			keywords: ['create', 'new', 'code', 'editor', 'programming'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('code', center.x, center.y);
			}
		},
		{
			id: 'create-image',
			label: 'Add Image',
			description: 'Upload or add an image',
			icon: Image,
			category: 'Create',
			keywords: ['create', 'new', 'image', 'photo', 'picture', 'upload'],
			action: () => {
				const center = getViewportCenter();
				// Trigger image upload
				triggerImageUpload(center.x, center.y);
			}
		},
		{
			id: 'create-embed',
			label: 'Create Embed',
			description: 'Embed web content',
			icon: Globe,
			category: 'Create',
			keywords: ['create', 'new', 'embed', 'web', 'iframe', 'link'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('embed', center.x, center.y);
			}
		},
		{
			id: 'create-pdf',
			label: 'Add PDF',
			description: 'Add a PDF document',
			icon: FileText,
			category: 'Create',
			keywords: ['create', 'new', 'pdf', 'document'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('pdf', center.x, center.y);
			}
		},
		{
			id: 'create-audio',
			label: 'Add Audio',
			description: 'Add an audio file',
			icon: Music,
			category: 'Create',
			keywords: ['create', 'new', 'audio', 'music', 'sound'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('audio', center.x, center.y);
			}
		},
		{
			id: 'create-drawing',
			label: 'Add Drawing',
			description: 'Create an Excalidraw drawing canvas',
			icon: PenTool,
			category: 'Create',
			keywords: ['create', 'new', 'drawing', 'sketch', 'canvas', 'excalidraw', 'draw'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('drawing', center.x, center.y);
			}
		},
		{
			id: 'create-repl',
			label: 'Create REPL',
			description: 'Add a new Svelte REPL node',
			icon: TerminalSquare,
			category: 'Create',
			keywords: ['create', 'new', 'repl', 'svelte', 'code', 'editor', 'run'],
			action: () => {
				const center = getViewportCenter();
				createNewNode('repl', center.x, center.y);
			}
		},
		// Navigation commands
		{
			id: 'zoom-fit',
			label: 'Zoom to Fit All',
			description: 'Zoom out to see all nodes',
			icon: ZoomIn,
			category: 'Navigation',
			keywords: ['zoom', 'fit', 'all', 'overview'],
			action: () => zoomToFitAll()
		},
		{
			id: 'zoom-in',
			label: 'Zoom In',
			description: 'Zoom in to the canvas',
			icon: ZoomIn,
			category: 'Navigation',
			keywords: ['zoom', 'in', '+'],
			action: () => {
				const currentZoom = canvasStore.zoom;
				const newZoom = Math.min(currentZoom * 1.25, 5);
				canvasStore.setTargetViewportAnimated(
					{
						zoom: newZoom,
						x: canvasStore.offsetX,
						y: canvasStore.offsetY
					},
					300
				);
			}
		},
		{
			id: 'zoom-out',
			label: 'Zoom Out',
			description: 'Zoom out from the canvas',
			icon: ZoomOut,
			category: 'Navigation',
			keywords: ['zoom', 'out', '-'],
			action: () => {
				const currentZoom = canvasStore.zoom;
				const newZoom = Math.max(currentZoom * 0.8, 0.1);
				canvasStore.setTargetViewportAnimated(
					{
						zoom: newZoom,
						x: canvasStore.offsetX,
						y: canvasStore.offsetY
					},
					300
				);
			}
		},
		{
			id: 'center-view',
			label: 'Center View',
			description: 'Center the viewport',
			icon: Target,
			category: 'Navigation',
			keywords: ['center', 'home', 'origin'],
			action: () => {
				canvasStore.setTargetViewportAnimated(
					{
						zoom: canvasStore.zoom,
						x: viewportWidth / 2,
						y: viewportHeight / 2
					},
					300
				);
			}
		},
		// Actions
		{
			id: 'regenerate-gallery',
			label: 'Generate Artwork Gallery',
			description: 'Create a new artwork gallery',
			icon: Shuffle,
			category: 'Actions',
			keywords: ['generate', 'artwork', 'gallery', 'random', 'demo'],
			action: () => {
				canvasStore.regenerateScene().catch(console.error);
			}
		},
		{
			id: 'export-canvas',
			label: 'Export Canvas',
			description: 'Export current canvas data',
			icon: Download,
			category: 'Actions',
			keywords: ['export', 'download', 'save', 'backup'],
			action: () => {
				// Export canvas functionality
				const state = canvasStore.getState();
				const dataStr = JSON.stringify(state, null, 2);
				const dataBlob = new Blob([dataStr], { type: 'application/json' });
				const url = URL.createObjectURL(dataBlob);
				const link = document.createElement('a');
				link.href = url;
				link.download = `canvas-${new Date().toISOString().split('T')[0]}.json`;
				link.click();
				URL.revokeObjectURL(url);
			}
		},
		{
			id: 'save-canvas',
			label: 'Save Canvas',
			description: 'Save current canvas state',
			icon: Save,
			category: 'Actions',
			keywords: ['save', 'persist', 'store'],
			action: () => {
				// Trigger save
				canvasStore.onViewChange(viewportWidth, viewportHeight);
			}
		}
	];

	// Generate dynamic commands for existing nodes and canvases
	const allCommands = $derived(() => {
		const commands: Command[] = [...staticCommands];

		// Add node navigation commands
		const boxes = canvasStore.boxes;
		boxes.forEach((box) => {
			let nodeTitle = 'Untitled';
			let nodePreview = '';

			if (typeof box.content === 'string') {
				nodeTitle = box.content.split('\n')[0].slice(0, 32) || 'Untitled';
				nodePreview = box.content.slice(0, 60);
			} else if (box.content && typeof box.content === 'object') {
				nodeTitle =
					(box.content.title as string) ||
					(box.content.body as string)?.split('\n')[0]?.slice(0, 32) ||
					(box.content.markdown as string)?.split('\n')[0]?.slice(0, 32) ||
					'Untitled';

				nodePreview =
					(box.content.body as string)?.slice(0, 60) ||
					(box.content.markdown as string)?.slice(0, 60) ||
					'';
			}

			commands.push({
				id: `goto-node-${box.id}`,
				label: `Go to ${nodeTitle}`,
				description: nodePreview || `Navigate to ${box.type} node`,
				icon: getNodeIcon(box.type),
				category: 'Navigate',
				keywords: [
					'goto',
					'navigate',
					'node',
					nodeTitle.toLowerCase(),
					box.type,
					...(box.tags || [])
				],
				action: () => {
					canvasStore.selectBox(box.id, viewportWidth, viewportHeight);
					canvasStore.zoomToBox(box.id, viewportWidth, viewportHeight);
				},
				data: { nodeId: box.id, nodeType: box.type }
			});
		});

		// Add canvas navigation commands
		const canvases = canvasManager.canvases;
		canvases.forEach((canvas) => {
			if (canvas.id !== canvasManager.activeCanvasId) {
				commands.push({
					id: `switch-canvas-${canvas.id}`,
					label: `Switch to ${canvas.name}`,
					description: `Open canvas: ${canvas.name}`,
					icon: Maximize2,
					category: 'Canvas',
					keywords: ['switch', 'canvas', 'open', canvas.name.toLowerCase()],
					action: () => {
						canvasManager.switchToCanvas(canvas.id);
					},
					data: { canvasId: canvas.id }
				});
			}
		});

		return commands;
	});

	// Filter commands based on search query
	const filteredCommands = $derived(() => {
		const commands = allCommands; // Get the computed commands array

		if (!searchQuery.trim()) {
			return commands.slice(0, 8); // Show first 8 commands when no search
		}

		const query = searchQuery.toLowerCase();
		return commands
			.filter(
				(cmd) =>
					cmd.label.toLowerCase().includes(query) ||
					cmd.description?.toLowerCase().includes(query) ||
					cmd.keywords.some((keyword) => keyword.toLowerCase().includes(query))
			)
			.sort((a, b) => {
				// Prioritize exact matches in label
				const aLabelMatch = a.label.toLowerCase().includes(query);
				const bLabelMatch = b.label.toLowerCase().includes(query);
				if (aLabelMatch && !bLabelMatch) return -1;
				if (!aLabelMatch && bLabelMatch) return 1;

				// Then prioritize category matches
				const aCategoryMatch = a.category.toLowerCase().includes(query);
				const bCategoryMatch = b.category.toLowerCase().includes(query);
				if (aCategoryMatch && !bCategoryMatch) return -1;
				if (!aCategoryMatch && bCategoryMatch) return 1;

				return 0;
			})
			.slice(0, 10); // Limit to 10 results
	});

	// Reset selection when commands change
	$effect(() => {
		if (filteredCommands.length > 0) {
			selectedIndex = Math.min(selectedIndex, filteredCommands.length - 1);
		} else {
			selectedIndex = 0;
		}
	});

	// Keyboard event handler
	function handleKeydown(event: KeyboardEvent) {
		if (!browser) return;

		// Toggle palette with Cmd+K / Ctrl+K
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			togglePalette();
			return;
		}

		// Only handle other keys when palette is open
		if (!isOpen) return;

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				closePalette();
				break;
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				executeSelected();
				break;
		}
	}

	// Helper functions
	function togglePalette() {
		if (isOpen) {
			closePalette();
		} else {
			openPalette();
		}
	}

	function openPalette() {
		isOpen = true;
		searchQuery = '';
		selectedIndex = 0;

		// Focus input after DOM update
		setTimeout(() => {
			searchInput?.focus();
		}, 0);
	}

	function closePalette() {
		isOpen = false;
		searchQuery = '';
		selectedIndex = 0;
	}

	function executeSelected() {
		const command = filteredCommands[selectedIndex];
		if (command) {
			command.action();
			closePalette();
		}
	}

	function getNodeIcon(nodeType: string) {
		const iconMap: Record<string, any> = {
			sticky: StickyNote,
			note: StickyNote,
			markdown: FileType,
			code: Code,
			image: Image,
			embed: Globe,
			pdf: FileText,
			audio: Music,
			repl: TerminalSquare
		};
		return iconMap[nodeType] || FileText;
	}

	// Helper functions for node creation (similar to CanvasViewport)
	function createNewNode(type: string, worldX: number, worldY: number) {
		const DEFAULT_NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
			sticky: { width: 400, height: 400 },
			code: { width: 500, height: 300 },
			image: { width: 420, height: 200 },
			embed: { width: 800, height: 450 },
			note: { width: 400, height: 400 },
			markdown: { width: 500, height: 400 },
			drawing: { width: 600, height: 500 },
			repl: { width: 500, height: 300 }
		};

		const dimensions = DEFAULT_NODE_DIMENSIONS[type] || DEFAULT_NODE_DIMENSIONS.sticky;

		const newBox = {
			id: Date.now(),
			x: worldX - dimensions.width / 2,
			y: worldY - dimensions.height / 2,
			width: dimensions.width,
			height: dimensions.height,
			z: 0,
			content: getDefaultContent(type),
			color: '#2a2a2a',
			type: type
		};

		canvasStore.addBox(newBox);
		canvasStore.selectBox(newBox.id, viewportWidth, viewportHeight);
		canvasStore.zoomToBox(newBox.id, viewportWidth, viewportHeight);
	}

	function getDefaultContent(type: string): string | object {
		switch (type) {
			case 'note':
				return 'New note...';
			case 'markdown':
				return {
					markdown: `# New Document\n\nStart writing your markdown here...`
				};
			case 'code':
				return '// New code block\nconsole.log("Hello, world!");';
			case 'embed':
			case 'pdf':
			case 'audio':
				return '';
			case 'drawing':
				return {
					excalidrawUrl: undefined
				};
			case 'repl':
				return {
					// No initial content needed for now
				};
			default:
				return 'New content';
		}
	}

	function triggerImageUpload(worldX: number, worldY: number) {
		// Create a hidden file input
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.style.display = 'none';

		input.onchange = (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				const file = files[0];
				const reader = new FileReader();
				reader.onload = (event) => {
					const dataUrl = event.target?.result as string;
					if (dataUrl) {
						createImageNode(dataUrl, worldX, worldY);
					}
				};
				reader.readAsDataURL(file);
			}
			document.body.removeChild(input);
		};

		document.body.appendChild(input);
		input.click();
	}

	async function createImageNode(dataUrl: string, worldX: number, worldY: number) {
		// Calculate dimensions from image
		const img = new Image();
		img.onload = () => {
			const aspectRatio = img.naturalWidth / img.naturalHeight;
			const MAX_DIM = 600;

			let boxWidth, boxHeight;
			if (aspectRatio > 1) {
				boxWidth = Math.min(img.naturalWidth, MAX_DIM);
				boxHeight = Math.round(boxWidth / aspectRatio);
			} else {
				boxHeight = Math.min(img.naturalHeight, MAX_DIM);
				boxWidth = Math.round(boxHeight * aspectRatio);
			}

			const newBox = {
				id: Date.now(),
				x: worldX - boxWidth / 2,
				y: worldY - boxHeight / 2,
				width: boxWidth,
				height: boxHeight,
				z: 0,
				content: dataUrl,
				color: '#2a2a2a',
				type: 'image'
			};

			canvasStore.addBox(newBox);
			canvasStore.selectBox(newBox.id, viewportWidth, viewportHeight);
			canvasStore.zoomToBox(newBox.id, viewportWidth, viewportHeight);
		};
		img.src = dataUrl;
	}

	function zoomToFitAll() {
		const boxes = canvasStore.boxes;
		if (boxes.length === 0) return;

		// Calculate bounding box
		const padding = 100;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;

		boxes.forEach((box) => {
			minX = Math.min(minX, box.x);
			minY = Math.min(minY, box.y);
			maxX = Math.max(maxX, box.x + box.width);
			maxY = Math.max(maxY, box.y + box.height);
		});

		const contentWidth = maxX - minX + padding * 2;
		const contentHeight = maxY - minY + padding * 2;

		const scaleX = viewportWidth / contentWidth;
		const scaleY = viewportHeight / contentHeight;
		const scale = Math.min(scaleX, scaleY, 1);

		const centerX = (minX + maxX) / 2;
		const centerY = (minY + maxY) / 2;

		const offsetX = viewportWidth / 2 - centerX * scale;
		const offsetY = viewportHeight / 2 - centerY * scale;

		canvasStore.setTargetViewportAnimated(
			{
				zoom: scale,
				x: offsetX,
				y: offsetY
			},
			500
		);
	}

	// Event listeners
	onMount(() => {
		if (browser) {
			document.addEventListener('keydown', handleKeydown);
		}
	});

	onDestroy(() => {
		if (browser) {
			document.removeEventListener('keydown', handleKeydown);
		}
	});

	// Close palette when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (paletteElement && !paletteElement.contains(event.target as Node)) {
			closePalette();
		}
	}

	$effect(() => {
		if (isOpen && browser) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

{#if isOpen}
	<div class="command-palette-overlay" transition:fade={{ duration: 150 }}>
		<div
			bind:this={paletteElement}
			class="command-palette"
			role="dialog"
			aria-label="Command Palette"
		>
			<!-- Search input -->
			<div class="search-section">
				<Search size={18} class="search-icon" />
				<input
					bind:this={searchInput}
					bind:value={searchQuery}
					placeholder="Type a command or search..."
					class="search-input"
					type="text"
					autocomplete="off"
					spellcheck="false"
				/>
				<kbd class="search-shortcut">ESC</kbd>
			</div>

			<!-- Commands list -->
			{#if filteredCommands.length > 0}
				<div class="commands-section">
					{#each filteredCommands as command, index (command.id)}
						<button
							class="command-item"
							class:selected={index === selectedIndex}
							onclick={() => {
								selectedIndex = index;
								executeSelected();
							}}
							onmouseenter={() => (selectedIndex = index)}
						>
							<div class="command-icon">
								<command.icon size={16} />
							</div>
							<div class="command-content">
								<div class="command-label">{command.label}</div>
								{#if command.description}
									<div class="command-description">{command.description}</div>
								{/if}
							</div>
							<div class="command-category">{command.category}</div>
							{#if index === selectedIndex}
								<ArrowRight size={14} class="command-arrow" />
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<div class="no-results">
					<Search size={24} />
					<p>No commands found</p>
					<p class="no-results-hint">Try a different search term</p>
				</div>
			{/if}

			<!-- Footer -->
			<div class="palette-footer">
				<div class="footer-shortcuts">
					<kbd>↑↓</kbd> Navigate
					<kbd>Enter</kbd> Select
					<kbd>ESC</kbd> Close
				</div>
				<div class="footer-tip">
					<Hash size={12} />
					Tip: Press <kbd>⌘K</kbd> to open command palette
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.command-palette-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		z-index: 1000;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 15vh;
	}

	.command-palette {
		width: 100%;
		max-width: 600px;
		background: #1a1a1a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		box-shadow:
			0 20px 40px rgba(0, 0, 0, 0.3),
			0 0 0 1px rgba(255, 255, 255, 0.05);
		overflow: hidden;
		margin: 0 20px;
	}

	.search-section {
		display: flex;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		gap: 12px;
	}

	.search-icon {
		color: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: white;
		font-size: 16px;
		font-family: inherit;
		placeholder-color: rgba(255, 255, 255, 0.5);
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}

	.search-shortcut {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-family: ui-monospace, monospace;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.commands-section {
		max-height: 400px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
	}

	.commands-section::-webkit-scrollbar {
		width: 6px;
	}

	.commands-section::-webkit-scrollbar-track {
		background: transparent;
	}

	.commands-section::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.command-item {
		width: 100%;
		display: flex;
		align-items: center;
		padding: 12px 20px;
		border: none;
		background: none;
		color: white;
		text-align: left;
		cursor: pointer;
		transition: background-color 0.1s ease;
		gap: 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.command-item:hover,
	.command-item.selected {
		background: rgba(255, 255, 255, 0.08);
	}

	.command-item.selected {
		background: rgba(59, 130, 246, 0.15);
		border-color: rgba(59, 130, 246, 0.2);
	}

	.command-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: rgba(255, 255, 255, 0.7);
		flex-shrink: 0;
	}

	.command-item.selected .command-icon {
		color: rgba(59, 130, 246, 0.9);
	}

	.command-content {
		flex: 1;
		min-width: 0;
	}

	.command-label {
		font-size: 14px;
		font-weight: 500;
		color: white;
		line-height: 1.4;
	}

	.command-description {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.3;
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.command-category {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.08);
		padding: 2px 6px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 500;
		flex-shrink: 0;
	}

	.command-arrow {
		color: rgba(59, 130, 246, 0.7);
		flex-shrink: 0;
	}

	.no-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	.no-results p {
		margin: 8px 0 4px 0;
		font-size: 14px;
	}

	.no-results-hint {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.3);
	}

	.palette-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.02);
	}

	.footer-shortcuts {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
	}

	.footer-tip {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.4);
	}

	kbd {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 10px;
		font-family: ui-monospace, monospace;
		border: 1px solid rgba(255, 255, 255, 0.2);
		min-width: 20px;
		text-align: center;
	}
</style>
