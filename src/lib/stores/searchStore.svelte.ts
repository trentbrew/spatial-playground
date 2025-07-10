import { canvasStore } from './canvasStore.svelte';
import type { AppBoxState } from '$lib/canvasState';

// Search result interface
export interface SearchResult {
	node: AppBoxState;
	score: number;
	matches: SearchMatch[];
	preview: string;
}

export interface SearchMatch {
	field: string; // 'title', 'content', 'tags'
	value: string;
	highlightedValue: string;
	startIndex: number;
	endIndex: number;
}

// Search filters
export interface SearchFilters {
	types?: string[];
	tags?: string[];
	dateRange?: {
		start?: Date;
		end?: Date;
	};
	zRange?: {
		min?: number;
		max?: number;
	};
}

// Search store state
let searchQuery = $state('');
let searchResults = $state<SearchResult[]>([]);
let isSearching = $state(false);
let searchFilters = $state<SearchFilters>({});
let searchHistory = $state<string[]>([]);

// Constants
const MAX_SEARCH_RESULTS = 50;
const MAX_PREVIEW_LENGTH = 120;
const MAX_HISTORY_ITEMS = 10;

// Helper functions for text processing
function normalizeText(text: string): string {
	return text.toLowerCase().trim();
}

function extractTextContent(content: any): string {
	if (typeof content === 'string') {
		return content;
	} else if (content && typeof content === 'object') {
		// Extract text from various content types
		const texts: string[] = [];

		if (content.title) texts.push(content.title);
		if (content.body) texts.push(content.body);
		if (content.markdown) texts.push(content.markdown);
		if (content.text) texts.push(content.text);
		if (content.code) texts.push(content.code);
		if (content.url) texts.push(content.url);
		if (content.description) texts.push(content.description);

		return texts.join(' ');
	}
	return '';
}

function highlightMatches(text: string, query: string): string {
	if (!query.trim()) return text;

	const words = query.trim().split(/\s+/).filter(Boolean);
	let highlightedText = text;

	words.forEach((word) => {
		const regex = new RegExp(`(${escapeRegExp(word)})`, 'gi');
		highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
	});

	return highlightedText;
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createPreview(
	content: string,
	query: string,
	maxLength: number = MAX_PREVIEW_LENGTH
): string {
	if (!content || !query.trim()) {
		return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '');
	}

	const normalizedContent = content.toLowerCase();
	const normalizedQuery = query.toLowerCase();
	const words = normalizedQuery.split(/\s+/).filter(Boolean);

	// Find the first match position
	let firstMatchIndex = -1;
	for (const word of words) {
		const index = normalizedContent.indexOf(word);
		if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
			firstMatchIndex = index;
		}
	}

	if (firstMatchIndex === -1) {
		return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '');
	}

	// Create preview centered around the first match
	const start = Math.max(0, firstMatchIndex - Math.floor(maxLength / 3));
	const end = Math.min(content.length, start + maxLength);

	let preview = content.slice(start, end);
	if (start > 0) preview = '...' + preview;
	if (end < content.length) preview = preview + '...';

	return preview;
}

function calculateSearchScore(node: AppBoxState, query: string, matches: SearchMatch[]): number {
	if (!query.trim()) return 0;

	let score = 0;
	const normalizedQuery = normalizeText(query);
	const words = normalizedQuery.split(/\s+/).filter(Boolean);

	// Score based on match fields (weighted)
	const fieldWeights = {
		title: 3.0,
		content: 1.0,
		tags: 2.0,
		type: 1.5
	};

	matches.forEach((match) => {
		const weight = fieldWeights[match.field as keyof typeof fieldWeights] || 1.0;
		const matchLength = match.endIndex - match.startIndex;
		score += weight * matchLength;
	});

	// Boost score for exact phrase matches
	const contentText = extractTextContent(node.content);
	if (normalizeText(contentText).includes(normalizedQuery)) {
		score *= 1.5;
	}

	// Boost score for multiple word matches
	const wordMatches = words.filter((word) => normalizeText(contentText).includes(word)).length;
	score *= 1 + (wordMatches - 1) * 0.2;

	// Boost recent/selected nodes
	if (canvasStore.selectedBoxId === node.id) {
		score *= 1.3;
	}
	if (canvasStore.lastSelectedBoxId === node.id) {
		score *= 1.1;
	}

	return score;
}

function findMatches(node: AppBoxState, query: string): SearchMatch[] {
	const matches: SearchMatch[] = [];
	const normalizedQuery = normalizeText(query);
	const words = normalizedQuery.split(/\s+/).filter(Boolean);

	if (!words.length) return matches;

	// Check title
	const title = (node.content && typeof node.content === 'object' && node.content.title) || '';
	const normalizedTitle = normalizeText(title);
	words.forEach((word) => {
		const index = normalizedTitle.indexOf(word);
		if (index !== -1) {
			matches.push({
				field: 'title',
				value: title,
				highlightedValue: highlightMatches(title, query),
				startIndex: index,
				endIndex: index + word.length
			});
		}
	});

	// Check content
	const contentText = extractTextContent(node.content);
	const normalizedContent = normalizeText(contentText);
	words.forEach((word) => {
		const index = normalizedContent.indexOf(word);
		if (index !== -1) {
			matches.push({
				field: 'content',
				value: contentText,
				highlightedValue: highlightMatches(contentText, query),
				startIndex: index,
				endIndex: index + word.length
			});
		}
	});

	// Check tags
	const tags = node.tags || [];
	tags.forEach((tag) => {
		const normalizedTag = normalizeText(tag);
		words.forEach((word) => {
			if (normalizedTag.includes(word)) {
				matches.push({
					field: 'tags',
					value: tag,
					highlightedValue: highlightMatches(tag, query),
					startIndex: 0,
					endIndex: tag.length
				});
			}
		});
	});

	// Check node type
	const normalizedType = normalizeText(node.type);
	words.forEach((word) => {
		if (normalizedType.includes(word)) {
			matches.push({
				field: 'type',
				value: node.type,
				highlightedValue: highlightMatches(node.type, query),
				startIndex: 0,
				endIndex: node.type.length
			});
		}
	});

	return matches;
}

function matchesFilters(node: AppBoxState, filters: SearchFilters): boolean {
	// Type filter
	if (filters.types && filters.types.length > 0) {
		if (!filters.types.includes(node.type)) {
			return false;
		}
	}

	// Tags filter
	if (filters.tags && filters.tags.length > 0) {
		const nodeTags = node.tags || [];
		const hasMatchingTag = filters.tags.some((tag) => nodeTags.includes(tag));
		if (!hasMatchingTag) {
			return false;
		}
	}

	// Z-range filter
	if (filters.zRange) {
		if (filters.zRange.min !== undefined && node.z < filters.zRange.min) {
			return false;
		}
		if (filters.zRange.max !== undefined && node.z > filters.zRange.max) {
			return false;
		}
	}

	// Date range filter (would need timestamps on nodes)
	// This is placeholder for future implementation
	// if (filters.dateRange) {
	//   // Check node creation/modification dates
	// }

	return true;
}

async function performSearch(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
	const normalizedQuery = normalizeText(query);
	if (!normalizedQuery) return [];

	const nodes = canvasStore.boxes;
	const results: SearchResult[] = [];

	for (const node of nodes) {
		// Apply filters first
		if (!matchesFilters(node, filters)) {
			continue;
		}

		// Find matches
		const matches = findMatches(node, query);

		if (matches.length === 0) {
			continue;
		}

		// Calculate score
		const score = calculateSearchScore(node, query, matches);

		// Create preview
		const contentText = extractTextContent(node.content);
		const preview = createPreview(contentText, query);

		results.push({
			node,
			score,
			matches,
			preview
		});
	}

	// Sort by score (descending) and limit results
	return results.sort((a, b) => b.score - a.score).slice(0, MAX_SEARCH_RESULTS);
}

// Store interface
export const searchStore = {
	// Getters
	get query() {
		return searchQuery;
	},
	get results() {
		return searchResults;
	},
	get isSearching() {
		return isSearching;
	},
	get filters() {
		return searchFilters;
	},
	get history() {
		return searchHistory;
	},

	// Search actions
	async search(query: string, filters: SearchFilters = {}) {
		const trimmedQuery = query.trim();

		if (!trimmedQuery) {
			searchQuery = '';
			searchResults = [];
			return;
		}

		isSearching = true;
		searchQuery = trimmedQuery;
		searchFilters = { ...filters };

		try {
			const results = await performSearch(trimmedQuery, filters);
			searchResults = results;

			// Add to search history (avoid duplicates)
			if (!searchHistory.includes(trimmedQuery)) {
				searchHistory = [trimmedQuery, ...searchHistory.slice(0, MAX_HISTORY_ITEMS - 1)];
			}
		} catch (error) {
			console.error('Search error:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	},

	// Clear search
	clear() {
		searchQuery = '';
		searchResults = [];
		searchFilters = {};
	},

	// Filter actions
	setFilters(filters: SearchFilters) {
		searchFilters = { ...filters };
		if (searchQuery) {
			this.search(searchQuery, searchFilters);
		}
	},

	addTypeFilter(type: string) {
		const currentTypes = searchFilters.types || [];
		if (!currentTypes.includes(type)) {
			this.setFilters({
				...searchFilters,
				types: [...currentTypes, type]
			});
		}
	},

	removeTypeFilter(type: string) {
		const currentTypes = searchFilters.types || [];
		this.setFilters({
			...searchFilters,
			types: currentTypes.filter((t) => t !== type)
		});
	},

	addTagFilter(tag: string) {
		const currentTags = searchFilters.tags || [];
		if (!currentTags.includes(tag)) {
			this.setFilters({
				...searchFilters,
				tags: [...currentTags, tag]
			});
		}
	},

	removeTagFilter(tag: string) {
		const currentTags = searchFilters.tags || [];
		this.setFilters({
			...searchFilters,
			tags: currentTags.filter((t) => t !== tag)
		});
	},

	// History management
	clearHistory() {
		searchHistory = [];
	},

	removeFromHistory(query: string) {
		searchHistory = searchHistory.filter((q) => q !== query);
	},

	// Utility functions
	highlightText: highlightMatches,
	createPreview
};
