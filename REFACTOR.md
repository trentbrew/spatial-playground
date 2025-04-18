# Refactoring Strategy for a Svelte-based Infinite Canvas

This document outlines an approach to break the existing infinite canvas application into smaller, modular, and focused units. The goal is to separate concerns such as state management, rendering, and interaction logic.

---

## 1. Centralized State Management (Svelte Stores)

**Problem:**
All state variables (e.g., `zoom`, `offsetX`, `offsetY`, `boxes`, `selectedBoxId`, `fullscreenBoxId`, and interaction flags like `isPanning`) are managed within the main component. This makes sharing state or incorporating business logic into child components or external modules difficult.

**Solution:**
Employ Svelte Stores to manage the core canvas state.

### canvasStore.ts

- **Core View State:**

  - `zoom`, `offsetX`, `offsetY`
  - `targetZoom`, `targetOffsetX`, `targetOffsetY`

- **Element State:**

  - `boxes` (an array of `AppBoxState`)

- **Interaction State:**

  - `selectedBoxId`, `fullscreenBoxId`
  - (Optionally, interaction modes like `isPanning`, `isDragging`, `isResizing` can either be stored here or managed separately by interaction modules.)

- **Methods to Update State:**
  - `panBy(dx, dy)`
  - `zoomTo(level, centerX, centerY)`
  - `addBox(box)`
  - `updateBox(id, partialBox)`
  - `selectBox(id)`
  - `setFullscreen(id)`

---

## 2. Component Decomposition

**Problem:**
The main component handles everything – from viewport setup and background rendering to node rendering, event handling, and UI controls.

**Solution:**
Break the UI into dedicated, logical components.

### CanvasViewport.svelte (New Top-Level Container)

**Responsibilities:**

- Set up the main viewport (`<div class="viewport">`) and bind its reference.
- Initialize (and possibly manage) the core `canvasStore`.
- Orchestrate child components, delegating most event handling.

**Example Structure:**

```svelte
<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore';
	import BackgroundCanvas from './BackgroundCanvas.svelte';
	import NodesLayer from './NodesLayer.svelte';
	import InteractionManager from './InteractionManager.svelte'; // Handles user input
	import ControlsOverlay from './ControlsOverlay.svelte';
	// ... other imports
</script>

<div class="viewport" bind:this={viewportElement}>
	<InteractionManager {viewportElement} />
	<BackgroundCanvas />
	<NodesLayer />
	<ControlsOverlay />
</div>

<style>
	/* Viewport styles */
</style>
```

---

### InteractionManager.svelte (or Hook/Action)

**Responsibilities:**

- Attach all event listeners (e.g., mouse, keyboard, touch, wheel, resize) to the `viewportElement` or window.
- Interpret these events (considering modifier keys and store state) to call corresponding canvasStore methods or trigger interaction logic (like starting a drag/pan).

**Alternative:**
Instead of a component, create composable functions or Svelte Actions (e.g., `use:panning`, `use:zooming`, `use:boxDragging`) to attach interaction behaviors. For example, see implementations in `lib/interactions/panning.ts` or `lib/interactions/zooming.ts`.

---

### BackgroundCanvas.svelte

**Responsibilities:**

- Manage the `<canvas>` element used for rendering the background.
- Subscribe to state variables (`zoom`, `offsetX`, `offsetY`) from the store.
- Handle the drawing logic (`drawBackground`), as well as resizing and device pixel ratio adjustments.

**Example Structure:**

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { canvasStore } from '$lib/stores/canvasStore';
	// ... import drawBackground logic ...

	let canvasElement: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	// Subscribe to store values needed for drawing
	$: ({ zoom, offsetX, offsetY } = $canvasStore);
	$: if (typeof window !== 'undefined' && ctx)
		drawBackground(ctx, canvasElement, zoom, offsetX, offsetY);

	// onMount/onDestroy for setup, cleanup, and resize observer
</script>

<canvas bind:this={canvasElement}></canvas>

<style>
	/* Canvas styles */
</style>
```

---

### NodesLayer.svelte

**Responsibilities:**

- Render the `div.world` element.
- Subscribe to `offsetX`, `offsetY`, and `zoom` to apply a transformation.
- Iterate over `boxes` from the store to render a `NodeContainer` for each box.
- Optionally manage a preview rectangle display if the feature is maintained.

**Example Structure:**

```svelte
<script lang="ts">
	import { canvasStore } from '$lib/stores/canvasStore';
	import NodeContainer from './NodeContainer.svelte';
	// ... other imports

	// Subscribe to store values
	$: ({ offsetX, offsetY, zoom, boxes, drawPreviewRect } = $canvasStore);
	$: worldTransform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
</script>

<div class="world" style:transform={worldTransform}>
	{#if drawPreviewRect}
		<!-- Preview box -->
	{/if}
	{#each boxes as box (box.id)}
		<NodeContainer {box} />
	{/each}
</div>

<style>
	/* World styles */
</style>
```

---

### NodeContainer.svelte

**Responsibilities:**

- Represent an individual box/node.
- Accept a box object as a prop and subscribe to `selectedBoxId` and `fullscreenBoxId` to conditionally apply styling (e.g., `.selected`, `.fullscreen`).
- Render the outer `<div class="box">`, including a drag handle and conditional display of resize handles.
- Delegate interactions such as mousedown for dragging/resizing, either via dispatched events or direct calls to interaction modules.
- Use `<svelte:component>` to render the specific node content component (e.g., `StickyNoteNode`).

**Example Structure:**

```svelte
<script lang="ts">
  import { canvasStore } from '$lib/stores/canvasStore';
  import type { AppBoxState } from '$lib/canvasState';
  import { nodeComponentMap } from './nodeComponentMap'; // Centralized map
  // ... imports for interaction hooks/dispatch

  export let box: AppBoxState;

  $: isSelected = $canvasStore.selectedBoxId === box.id;
  $: isFullscreen = $canvasStore.fullscreenBoxId === box.id;

  function handleDragStart(event) {
    // ... call drag interaction start
  }

  function handleResizeStart(event, handleType) {
    // ... call resize interaction start
  }

  function handleClick(event) {
    $canvasStore.selectBox(box.id);
    // Plus any multi-click logic as needed
  }

  function handleDoubleClick(event) {
    // ... call zoomToBox logic
  }
</script>

<div
  class="box"
  class:selected={isSelected}
  class:fullscreen={isFullscreen}
  style:left="{box.x}px"
  style:top="{box.y}px"
  style:width="{box.width}px"
  style:height="{box.height}px"
  on:click={handleClick}
  on:dblclick={handleDoubleClick}
>
  <div class="drag-handle" on:mousedown|stopPropagation={handleDragStart}>
    <!-- Fullscreen button -->
  </div>

  <svelte:component
    this={nodeComponentMap[box.type]}
    {...box}
    {isSelected}
    {isFullscreen}
    bind:content={box.content}  <!-- If content needs two-way binding -->
  />

  {#if isSelected && !isFullscreen}
    <!-- Resize Handles -->
    <div class="resize-handle handle-se" on:mousedown|stopPropagation={(e) => handleResizeStart(e, 'se')}></div>
    <!-- ... other handles ... -->
  {/if}
</div>

<style>
  /* Box and handle styles */
</style>
```

---

### StickyNoteNode.svelte (and Other Specific Node Types)

**Responsibilities:**

- Render node-specific content.
- Receive props like `content`, `color`, `id`, `isSelected`, and `isFullscreen`.
- Focus solely on presentation; no concerns for positioning or dragging.

---

### ControlsOverlay.svelte

**Responsibilities:**

- Render UI controls (e.g., Add Box button, Theme Toggle, debug inputs).
- Interact with the `canvasStore` by invoking methods (e.g., `addBoxInView()`, `exitFullscreen`) on events.

**Structure:**
This component primarily includes markup and event handlers that call store methods.

---

## 3. Interaction Logic Modules / Hooks / Actions

**Problem:**
Interaction logic such as panning, zooming, dragging, resizing, and multi-click is intertwined within large event handlers in the main component.

**Solution:**
Extract each interaction type into its own module or Svelte Action.

### Examples:

- **lib/interactions/panning.ts:**

  - Export a function `usePanning(node: HTMLElement, store: CanvasStore)` or a Svelte Action.
  - Attach necessary event listeners (mousedown, mousemove, mouseup, and keydown for the spacebar).
  - Manage internal state (`isPanning`, last mouse positions).
  - Call `store.panBy()` or `store.setOffsetTarget()` during mouse movement.
  - Return a destroy method for cleaning up listeners.

- **lib/interactions/zooming.ts:**
  Similar approach for wheel event handling and calling `store.zoomTo()`.

- **lib/interactions/boxDragging.ts:**
  Attaches event listeners (starting from NodeContainer’s mousedown), manages drag state, and updates box positions with `store.updateBox()`.

- **lib/interactions/boxResizing.ts:**
  Manages resize events and updates box dimensions in the store.

- **lib/interactions/multiClick.ts:**
  Differentiates between single and double clicks using timing logic (`setTimeout`, click count) to trigger either `store.selectBox()` or `store.zoomToBox()`.

---

## 4. Animation Loop

**Problem:**
The current animateView function combines viewport animations (pan/zoom) with fullscreen transitions that affect both the viewport and box dimensions.

**Solution:**
Maintain a single `requestAnimationFrame` loop, managed in `CanvasViewport.svelte` or a dedicated `lib/animation.ts` module:

- Read `targetZoom`, `targetOffsetX`, and `targetOffsetY` from the store.
- Use a linear interpolation (`lerp`) function to smoothly update the current state.
- Handle fullscreen transitions for the viewport by setting target values in the store, while CSS transitions trigger box animations in `NodeContainer.svelte`.

---

## 5. Utilities and Types

**Problem:**
Utility functions and type definitions are spread across the main component.

**Solution:**

- **lib/utils.ts:**
  Consolidate utility functions such as `debounce`, `lerp`, `easeInOutQuad`, and `screenToWorld`.

- **lib/types.ts or lib/canvasState.ts:**
  Consolidate all type definitions (e.g., `BoxState`, `GraphState`, `AppBoxState`, `CanvasStoreState`) and any serialization/deserialization logic (`serializeCanvasState`, `prepareStateForLoad`).

---

## Benefits of This Refactoring

- **Modularity:**
  Each component or module is responsible for a single aspect of the application.

- **Scalability:**

  - Easily add new node types by creating a new component and updating `nodeComponentMap`.
  - Incorporate additional interactions via dedicated modules or actions.
  - Update only the relevant components for rendering changes.
  - Simplify integration with other parts of the UI by interacting with the centralized `canvasStore`.

- **Testability:**
  Smaller, focused pieces are easier to test individually.

- **Readability & Maintainability:**
  Organized code improves clarity, debugging, and modification efforts.

- **Reusability:**
  Components and interaction hooks can be reused in different parts of the application.

---

## Implementation Steps

1. **Create `canvasStore.ts`:**
   Move core state management into this store.

2. **Refactor the Main Component:**
   Convert it into `CanvasViewport.svelte`.

3. **Extract Components:**

   - Create `BackgroundCanvas.svelte`
   - Create `NodesLayer.svelte`
   - Create `NodeContainer.svelte` and update the iteration in `NodesLayer.svelte`

4. **Extract Interaction Logic:**
   Gradually move panning, zooming, dragging, and resizing logic into separate modules/actions.

5. **Refactor the Animation Loop:**
   Update the current state by reading target values from the store.

6. **Organize Utilities and Types:**
   Move them into separate files (e.g., `lib/utils.ts`, `lib/types.ts`).

7. **Create `ControlsOverlay.svelte`:**
   Build the controls for adding boxes, theme toggling, etc.

8. **Test Thoroughly:**
   Ensure each stage works as expected.

---

This refactoring effort will significantly improve maintainability, scalability, and testability as the application grows. Leveraging Svelte's reactive stores and modular components streamlines both development and future enhancements.

---

# Refactoring Plan Implementation Notes

## Core Store Design

- **Ephemeral State**: Keep transient flags (e.g., `isMouseDown`) local to action/interaction modules
- **Derived Stores**: Use Svelte's derived stores for values like `worldTransform`

## SSR and Lifecycle Guards

- **Browser Checks**: Wrap DOM/BOM API usage in `if (browser)` or `onMount`
- **Action Cleanup**: Ensure all actions return proper destroy functions

## Performance & Rendering

- **BackgroundCanvas**:
  - Initial: Throttle redraws based on zoom/offset changes
  - Future: Consider `OffscreenCanvas` or pattern caching
- **Node Virtualization**: Plan for future implementation via `NodesLayer`

## Interaction Modules

- **Standard Context**: Use `{ store, viewportElement, config }` pattern
- **Click Handling**: Create reusable `useClickPattern` action

## Animation Strategy

- **CSS Transitions**: For element properties (box dimensions/position)
- **JS Animation**: For viewport transformations (zoom/offset)
- **Future**: Extract to `lib/animation.ts` if logic grows

## Code Organization

- **Utilities**: Group in `lib/utils/` with index files
- **Documentation**: Add JSDoc to key functions/types

## Testing Approach

- **Unit Tests**: `canvasStore` methods (vitest)
- **Integration Tests**: Interaction actions (svelte-testing-library)

## Future Extensions

- **Undo/Redo**: Design for immutability
- **Persistence**: Version serialization format

## Implementation Steps

1. **Core Store**:
   - Create `lib/stores/canvasStore.ts`
   - Define state shape and basic methods
2. **Component Refactor**:
   - Convert `+page.svelte` to `CanvasViewport.svelte`
   - Extract `BackgroundCanvas.svelte`
3. **Incremental Extraction**:
   - NodesLayer
   - NodeContainer
   - Interaction actions

_Thanks for the valuable feedback - this will significantly improve the implementation!_
