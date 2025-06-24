# Zero Integration Plan

## Current State ✅

We've successfully set up the foundation for Zero integration:

1. **Zero Package Installed**: `@rocicorp/zero` is now available
2. **Persistence Interface Ready**: Canvas store has placeholder functions for Zero sync
3. **Clean Architecture**: Removed localStorage dependency to prepare for Zero
4. **UI Controls**: Save/Load/Clear buttons already exist in ControlsOverlay

## Zero Architecture Benefits

Based on [Zero documentation](https://zero.rocicorp.dev/docs/introduction), Zero provides:

- **Local-first**: Instant UI updates with local caching
- **Real-time sync**: Live collaboration across multiple users/tabs
- **Query-based**: ZQL queries feel like having entire database locally
- **CRDT conflict resolution**: Perfect for collaborative canvas editing
- **Offline-first**: Works without network, syncs when reconnected

## Implementation Steps

### Phase 1: Basic Zero Setup
1. **Create Zero Schema** (`src/lib/stores/zeroSchema.ts`)
   - Define canvas_state table (viewport: zoom, offsetX, offsetY)
   - Define boxes table (all node properties)
   - Set up proper relationships

2. **Initialize Zero Client** (`src/lib/stores/zeroClient.ts`)
   - Configure for local-only mode initially
   - Set up schema and userID
   - Handle browser/SSR guards

3. **Replace TurtleDB with Zero** in `canvasStore.svelte.ts`
   - Remove TurtleDB imports and logic
   - Use Zero queries for reactive boxes state
   - Use Zero mutations for box CRUD operations

### Phase 2: Viewport Persistence
1. **Reactive Viewport Sync**
   - Save viewport changes (zoom, pan) to Zero automatically
   - Load viewport state on initialization
   - Debounced saves for performance

2. **Cross-tab Synchronization**
   - Viewport changes sync across browser tabs
   - Real-time updates when other tabs change view

### Phase 3: Real-time Collaboration (Future)
1. **Zero Server Setup**
   - Deploy Zero cache server
   - Configure PostgreSQL backend
   - Set up proper authentication

2. **Multi-user Features**
   - User cursors and selections
   - Live collaborative editing
   - Conflict resolution for concurrent edits

## Technical Details

### Zero vs TurtleDB
- **TurtleDB**: Currently handles box data with local persistence
- **Zero**: Will replace TurtleDB with real-time sync + local cache
- **Migration**: Zero can store the same data structure as TurtleDB

### Zero vs localStorage
- **localStorage**: Manual save/load of viewport state
- **Zero**: Automatic reactive sync of all state
- **Benefits**: Real-time updates, cross-tab sync, future multiplayer

### File Structure
```
src/lib/stores/
├── canvasStore.svelte.ts     # Main store (updated for Zero)
├── zeroSchema.ts             # Zero table definitions
├── zeroClient.ts             # Zero instance setup
└── turtleDbStore.ts          # Remove after migration
```

## Next Steps

1. **Immediate**: Implement Phase 1 (local-only Zero setup)
2. **Short-term**: Replace TurtleDB with Zero for full local-first experience
3. **Medium-term**: Add real-time multiplayer when ready for collaboration

The foundation is solid - the persistence interface and UI controls are already in place. Zero will enhance the existing architecture with real-time capabilities perfect for collaborative canvas editing.
