import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { Jimp } from 'jimp';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DB_PATH = path.resolve('exports/canvas-2025-07-05T09-18-43-819Z.json');
const ARTWORK_DIR = path.resolve('src/lib/assets/artwork');
const EMBEDDINGS_TABLE = 'artwork_embeddings';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
	console.error('❌ GEMINI_API_KEY not found in .env');
	process.exit(1);
}

console.log(`DEBUG: GEMINI_API_KEY loaded: ${GEMINI_API_KEY ? 'YES' : 'NO'}`);

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const visionModel = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

// Helper to convert image to base64 for Gemini Vision API
async function fileToGenerativePart(filePath) {
	const mimeType = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
	const base64EncodedData = await fs.readFile(filePath, { encoding: 'base64' });
	return {
		inlineData: {
			data: base64EncodedData,
			mimeType
		}
	};
}

// Function to get dominant colors using Jimp
async function getDominantColors(imgPath, count = 6) {
	try {
		const image = await Jimp.read(imgPath);
		const colors = {};
		image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
			const hex = Jimp.rgbaToInt(
				this.bitmap.data[idx + 0],
				this.bitmap.data[idx + 1],
				this.bitmap.data[idx + 2],
				this.bitmap.data[idx + 3]
			);
			if (colors[hex]) {
				colors[hex]++;
			} else {
				colors[hex] = 1;
			}
		});

		const sortedColors = Object.entries(colors).sort(([, countA], [, countB]) => countB - countA);
		const dominantColors = sortedColors
			.slice(0, count)
			.map(([hex]) => `#${Jimp.intToHex(parseInt(hex))}`);
		return dominantColors;
	} catch (error) {
		console.error(`⚠️  Failed to extract colors for ${path.basename(imgPath)}`, error);
		return [];
	}
}

async function main() {
	console.log('🚀 Starting artwork embedding script...');

	let db = { boxes: [], artwork_embeddings: [] };
	try {
		db = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
		if (!db.artwork_embeddings) {
			db.artwork_embeddings = [];
		}
	} catch (error) {
		console.warn(`⚠️  Could not read existing DB file at ${DB_PATH}. Starting with empty DB.`);
	}

	// --- LOAD EXISTING EMBEDDINGS ---
	// Map by filename for idempotency; optionally also track by nodeId
	const embeddingsMap = new Map();
	db[EMBEDDINGS_TABLE].forEach((e) => {
		if (e.filename) embeddingsMap.set(e.filename, e);
		if (e.nodeId) embeddingsMap.set(e.nodeId, e);
	});

	// --- MAP EXISTING NODES (if any) ---
	const nodeMap = {};
	db.boxes.forEach((box) => {
		if (box.type === 'image' && box.content?.src) {
			const filename = path.basename(box.content.src);
			nodeMap[filename] = box.id;
		} else if (box.type === 'image' && box.body?.url) {
			// Handle cases where the URL is in the 'body.url' field
			const filename = path.basename(box.body.url);
			nodeMap[filename] = box.id;
		} else if (box.type === 'image' && box.title) {
			// Handle cases where title might contain filename
			const filename = path.basename(box.title);
			nodeMap[filename] = box.id;
		}
	});

	const imageFiles = (await fs.readdir(ARTWORK_DIR)).filter((file) =>
		/\.(jpg|jpeg|png|webp)$/i.test(file)
	);

	for (const img of imageFiles) {
		const imgPath = path.join(ARTWORK_DIR, img);
		const nodeId = nodeMap[img] ? String(nodeMap[img]) : null;
		const existing = embeddingsMap.get(img);
		if (existing) {
			// Update nodeId if it was missing and we now have one
			if (!existing.nodeId && nodeId) {
				existing.nodeId = nodeId;
				console.log(`🔗 Updated nodeId for existing embedding of ${img} -> ${nodeId}`);
			}
			console.log(`✅ Embedding already exists for ${img}, skipping.`);
			continue;
		}

		if (!nodeId) {
			console.log(`🔎 Processing: ${img} (no node yet)`);
		} else {
			console.log(`🔎 Processing: ${img} (nodeId: ${nodeId})`);
		}

		let description = '';
		let adjectives = [];
		let embedding = [];
		let colorScheme = [];

		try {
			// Extract colors
			colorScheme = await getDominantColors(imgPath, 6);

			// Generate description and adjectives using Gemini Vision
			const imagePart = await fileToGenerativePart(imgPath);
			const result = await visionModel.generateContent([
				imagePart,
				'Describe this image in detail, focusing on its main subject, style, and overall mood. Also, provide a comma-separated list of 5-10 adjectives that best describe the image.'
			]);
			const response = await result.response;
			const text = response.text();

			const [desc, adjText] = text
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean);
			description = desc || '';
			adjectives = adjText
				? adjText
						.replace('Adjectives: ', '')
						.split(',')
						.map((s) => s.trim())
				: [];

			// Generate embedding for the description
			if (description) {
				const embeddingResult = await embeddingModel.embedContent(description);
				embedding = embeddingResult.embedding.values;
			}
		} catch (error) {
			console.error(`❌ Gemini Vision error for ${img}`, error);
			// Keep existing values or null if error
		}

		const newEmbedding = {
			nodeId: nodeId,
			filename: img,
			embedding: embedding,
			description: description,
			adjectives: adjectives,
			colorScheme: colorScheme
		};

		db[EMBEDDINGS_TABLE].push(newEmbedding);
		embeddingsMap.set(img, newEmbedding); // Update map for idempotency
	}

	// Save updated DB
	try {
		await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
		console.log('\n✅ All done! Embeddings table updated in DB.');
	} catch (error) {
		console.error(`❌ Failed to write DB file: ${error.message}`);
	}
}

main();
