import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import Vibrant from 'node-vibrant/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- CONFIG ---
const DB_PATH = path.resolve('exports/canvas-2025-07-05T09-18-43-819Z.json');
const ARTWORK_DIR = path.resolve('src/lib/assets/artwork');
const EMBEDDINGS_TABLE = 'artwork_embeddings';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
	console.error('❌ GEMINI_API_KEY not found in .env');
	process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
const embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' });

// --- LOAD DB ---
let dbRaw = await fs.readFile(DB_PATH, 'utf-8');
let db = JSON.parse(dbRaw);
if (!db.boxes) {
	console.error('❌ No boxes array found in DB.');
	process.exit(1);
}
if (!db[EMBEDDINGS_TABLE]) db[EMBEDDINGS_TABLE] = [];

// --- SCAN ARTWORK DIR ---
const imageFiles = (await fs.readdir(ARTWORK_DIR)).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
console.log(`🖼️ Found ${imageFiles.length} images in artwork directory.`);

// --- BUILD NODE MAP FOR FAST LOOKUP ---
const nodeMap = {};
db.boxes.forEach(box => {
	let content = box.content;
	let filenames = [];
	if (typeof content === 'string') filenames.push(content);
	if (content && typeof content === 'object') {
		if (content.body) filenames.push(content.body);
		if (content.title) filenames.push(content.title);
		if (content.url) filenames.push(content.url);
	}
	filenames.forEach(fn => {
		if (typeof fn === 'string') {
			imageFiles.forEach(img => {
				if (fn.includes(img)) nodeMap[img] = box.id;
			});
		}
	});
});

// --- LOAD EXISTING EMBEDDINGS ---
const embeddingsMap = {};
db[EMBEDDINGS_TABLE].forEach(e => {
	embeddingsMap[e.nodeId] = e;
});

// --- MAIN LOOP ---
for (const img of imageFiles) {
	const nodeId = nodeMap[img];
	if (!nodeId) {
		console.log(`⚠️  No node found for image: ${img} (skipping)`);
		continue;
	}
	if (embeddingsMap[nodeId]) {
		console.log(`✅ Embedding already exists for nodeId ${nodeId} (${img}), skipping.`);
		continue;
	}
	const imgPath = path.join(ARTWORK_DIR, img);
	console.log(`\n🔎 Processing: ${img} (nodeId: ${nodeId})`);

	// --- 1. Extract color palette ---
	let colorScheme = [];
	try {
		const palette = await Vibrant.from(imgPath).getPalette();
		colorScheme = Object.values(palette)
			.filter(swatch => swatch)
			.map(swatch => swatch.getHex())
			.slice(0, 6); // 4-6 colors
		console.log('🎨 Color scheme:', colorScheme.join(', '));
	} catch (err) {
		console.warn('⚠️  Failed to extract colors for', img, err);
	}

	// --- 2. Generate caption/adjectives with Gemini Vision ---
	let description = '', adjectives = [];
	let embedding = null;
	try {
		const imgData = await fs.readFile(imgPath);
		const imgBase64 = imgData.toString('base64');
		const mime = img.endsWith('.png') ? 'image/png' : img.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
		const prompt = [
			{ text: 'Describe this artwork in one sentence, then list 4-6 adjectives that capture its mood, separated by commas.' },
			{ inlineData: { mimeType: mime, data: imgBase64 } },
		];
		const result = await visionModel.generateContent({
			contents: [{ role: 'user', parts: prompt }],
		});
		const text = result.response.text();
		const [desc, adjLine] = text.split(/\n|Adjectives:/);
		description = desc?.trim() || '';
		adjectives = (adjLine || '').split(',').map(a => a.trim()).filter(Boolean);
		console.log('📝 Description:', description);
		console.log('🔤 Adjectives:', adjectives.join(', '));
	} catch (err) {
		console.error('❌ Gemini Vision error for', img, err);
		continue;
	}

	// --- 3. Generate embedding for the caption ---
	try {
		const embedRes = await embeddingModel.embedContent({
			content: { parts: [{ text: description }] },
		});
		embedding = embedRes.embedding.values;
		console.log('📐 Text embedding generated.');
	} catch (err) {
		console.error('❌ Gemini embedding error for', img, err);
		continue;
	}

	// --- 4. Save embedding record ---
	const record = {
		nodeId: String(nodeId),
		filename: img,
		embedding,
		description,
		adjectives,
		colorScheme,
	};
	db[EMBEDDINGS_TABLE].push(record);
	embeddingsMap[nodeId] = record;
	console.log('💾 Saved embedding for', img);
}

// --- SAVE DB ---
await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
console.log('\n✅ All done! Embeddings table updated in DB.');
