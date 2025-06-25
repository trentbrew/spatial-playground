export interface InputAutoWidthOptions {
	/** Minimum width in pixels; defaults to 32. */
	minWidth?: number;
	/** Maximum width in pixels. If provided, the computed width is clamped to this value. */
	maxWidth?: number;
	/** Extra pixels to add on top of the measured width (to give cursor breathing room). Defaults to 2. */
	buffer?: number;
}

/**
 * Svelte action: automatically sets an <input type="text"> element's width so that it tightly fits its
 * current content (or its placeholder if empty).
 *
 * Example usage:
 * ```svelte
 * <input use:inputAutoWidth={{ minWidth: 32, maxWidth: 400 }} />
 * ```
 */
export function inputAutoWidth(node: HTMLInputElement, options: InputAutoWidthOptions = {}) {
	// Prepare off-screen measuring element
	const measuring = document.createElement('div');
	measuring.style.position = 'absolute';
	measuring.style.top = '0';
	measuring.style.left = '-9999px';
	measuring.style.visibility = 'hidden';
	measuring.style.whiteSpace = 'pre';
	measuring.style.height = '0';
	measuring.style.width = 'max-content';
	measuring.style.overflow = 'hidden';
	measuring.style.boxSizing = 'border-box';
	document.body.appendChild(measuring);

	const opts: Required<InputAutoWidthOptions> = {
		minWidth: options.minWidth ?? 32,
		maxWidth: options.maxWidth ?? Infinity,
		buffer: options.buffer ?? 2
	} as const;

	function copyStyles() {
		const cs = getComputedStyle(node);
		measuring.style.fontFamily = cs.fontFamily;
		measuring.style.fontSize = cs.fontSize;
		measuring.style.fontWeight = cs.fontWeight;
		measuring.style.fontStyle = cs.fontStyle;
		measuring.style.letterSpacing = cs.letterSpacing;
		measuring.style.paddingLeft = cs.paddingLeft;
		measuring.style.paddingRight = cs.paddingRight;
		measuring.style.borderLeftWidth = cs.borderLeftWidth;
		measuring.style.borderRightWidth = cs.borderRightWidth;
	}

	function updateWidth() {
		measuring.textContent = node.value || node.placeholder || '';
		copyStyles();

		// Trigger layout and read offsetWidth
		const width = measuring.offsetWidth + opts.buffer;
		const clamped = Math.max(opts.minWidth, Math.min(width, opts.maxWidth));
		node.style.width = `${clamped}px`;
	}

	// Initial run
	updateWidth();

	// Observers / listeners
	const inputListener = () => updateWidth();
	node.addEventListener('input', inputListener);

	// Detect style attribute changes that might influence size
	const mutationObserver = new MutationObserver(updateWidth);
	mutationObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });

	return {
		update(newOpts?: InputAutoWidthOptions) {
			if (newOpts) {
				Object.assign(opts, newOpts);
			}
			updateWidth();
		},
		destroy() {
			node.removeEventListener('input', inputListener);
			mutationObserver.disconnect();
			measuring.remove();
		}
	};
}
