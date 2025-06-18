interface ContextMenuItem {
	id: string;
	label: string;
	icon?: string | any; // Support both string (emoji) and Svelte component
	disabled?: boolean;
	separator?: boolean;
	submenu?: ContextMenuItem[];
}

interface ContextMenuState {
	visible: boolean;
	x: number;
	y: number;
	items: ContextMenuItem[];
	targetId?: number;
	worldX?: number;
	worldY?: number;
}

// Context menu state
let contextMenuState = $state<ContextMenuState>({
	visible: false,
	x: 0,
	y: 0,
	items: [],
	targetId: undefined,
	worldX: undefined,
	worldY: undefined
});

export const contextMenuStore = {
	// Getters
	get visible() {
		return contextMenuState.visible;
	},
	get x() {
		return contextMenuState.x;
	},
	get y() {
		return contextMenuState.y;
	},
	get items() {
		return contextMenuState.items;
	},
	get targetId() {
		return contextMenuState.targetId;
	},
	get worldX() {
		return contextMenuState.worldX;
	},
	get worldY() {
		return contextMenuState.worldY;
	},

	// Show context menu
	show(
		x: number,
		y: number,
		items: ContextMenuItem[],
		targetId?: number,
		worldX?: number,
		worldY?: number
	) {
		contextMenuState.visible = true;
		contextMenuState.x = x;
		contextMenuState.y = y;
		contextMenuState.items = items;
		contextMenuState.targetId = targetId;
		contextMenuState.worldX = worldX;
		contextMenuState.worldY = worldY;
	},

	// Hide context menu
	hide() {
		contextMenuState.visible = false;
		contextMenuState.targetId = undefined;
		contextMenuState.worldX = undefined;
		contextMenuState.worldY = undefined;
	},

	// Update position (useful for following mouse)
	updatePosition(x: number, y: number) {
		contextMenuState.x = x;
		contextMenuState.y = y;
	}
};

// Export the interface for use in components
export type { ContextMenuItem };
