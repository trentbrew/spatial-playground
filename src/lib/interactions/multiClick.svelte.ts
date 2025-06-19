import type { Action } from 'svelte/action';

export interface MultiClickOptions {
	single: (event: MouseEvent) => void;
	double: (event: MouseEvent) => void;
	delay?: number;
}

export const multiClick: Action<HTMLElement, MultiClickOptions> = (node, options) => {
	let clickCount = 0;
	let clickTimer: number;

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		clickCount++;
		if (clickCount === 1) {
			clickTimer = window.setTimeout(() => {
				if (clickCount === 1) {
					options.single(event);
				} else if (clickCount === 2) {
					options.double(event);
				}
				clickCount = 0;
			}, options.delay ?? 300);
		}
	}

	node.addEventListener('click', handleClick);

	return {
		update(newOptions: MultiClickOptions) {
			options = newOptions;
		},
		destroy() {
			node.removeEventListener('click', handleClick);
			clearTimeout(clickTimer);
		}
	};
};
