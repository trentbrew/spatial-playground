# 📝 Tags "disappeared" because of a schema mismatch, not a Svelte-state problem

## 1. What happened

- We added a top-level `tags` array to each `AppBoxState`.
- Locally, everything worked—the chip UI read/wrote `box.tags`.
- The Zero sync layer (`canvasZeroAdapter` → Zero mutators) only persisted the fields defined in its server schema (`id`, `x`, `y`, …, `content`).
- When a node was saved, Zero silently dropped the unknown `tags` field.
- On the very next poll (`🔄 Zero sync nodes received …`) the adapter replaced the in-memory box list with data that no longer contained tags, so the chip vanished.

## 2. Fix

We now treat tags as first-class in memory, but persist them inside `content`, a field already accepted by Zero.

### Implementation details

**`canvasStore.addTag` / `removeTag`**

- mutates `box.tags` for reactive UI updates.
- builds `newContent = { …box.content, tags: updatedTags }` and saves with
  `updateBox(boxId, { tags: updatedTags, content: newContent })`.
- (We still keep a top-level `tags` array for easy access in the UI; it's just not relied on for persistence.)

**`convertZeroBoxToAppBox` (in `canvasZeroAdapter`)**

- Extracts tags from `zeroBox.content?.tags` if present, so every box regains its tag list on load.

## 3. Lessons / guidelines

- Zero's mutators drop unknown properties. Always embed additional per-node data inside `content` unless the backend schema is extended.
- Keep a parallel top-level field in RAM if convenient for the Svelte UI, but make sure the adapter reconstructs it from `content` on load.
- When a field seems to "reset" after a save, enable logging around adapter subscriptions—if the incoming Zero payload lacks that field you've found the culprit.

## 4. Where this is documented

Added this explanation to the code comments inside
`canvasStore.addTag` / `removeTag` and in `convertZeroBoxToAppBox` so future contributors see why tags is round-tripped via `content`.

With this pattern in place you can safely add more lightweight metadata (e.g., `favorite: true`, `createdAt`, etc.) without server changes—just store it inside `content`.
