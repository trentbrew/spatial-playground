export function extractTextContent(content: any): string {
	if (!content) return '';
	if (typeof content === 'string') {
		return content;
	} else if (typeof content === 'object') {
		// Extract text from various known content object structures
		const texts: string[] = [];

		if (content.title) texts.push(content.title);
		if (content.body) texts.push(content.body);
		if (content.markdown) texts.push(content.markdown);
		if (content.text) texts.push(content.text);
		if (content.code) texts.push(content.code);
		if (content.url) texts.push(content.url);
		if (content.description) texts.push(content.description);

		// Fallback for unknown object structures: join all string values
		if (texts.length === 0) {
			Object.values(content).forEach((value) => {
				if (typeof value === 'string') {
					texts.push(value);
				}
			});
		}

		return texts.join(' ');
	}
	return '';
}
