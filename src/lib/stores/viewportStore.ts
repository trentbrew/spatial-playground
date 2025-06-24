import { writable } from 'svelte/store';

export const zoom = writable(1);
export const offsetX = writable(0);
export const offsetY = writable(0);

// Optionally, add helpers for centering, resetting, etc. as needed.
