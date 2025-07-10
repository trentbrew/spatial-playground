import { GoogleGenerativeAI } from '@google/generative-ai';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const GOOGLE_API_KEY = env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
	console.warn(
		'WARNING: GOOGLE_API_KEY is not set. Semantic search will not work. Please add it to your .env file.'
	);
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'embedding-001' });

export async function POST({ request }: { request: Request }) {
	if (!GOOGLE_API_KEY) {
		return json({ error: 'API key not configured' }, { status: 500 });
	}

	try {
		const { text } = await request.json();

		if (!text || typeof text !== 'string') {
			return json({ error: 'Invalid input text' }, { status: 400 });
		}

		const result = await model.embedContent(text);
		const embedding = result.embedding.values;

		return json({ embedding });
	} catch (error) {
		console.error('Embedding API error:', error);
		return json({ error: 'Failed to generate embedding' }, { status: 500 });
	}
}
