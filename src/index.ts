import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import url from 'url';
import { WebSocketServer } from 'ws';
import { auth } from './lib/auth';
import authMiddleware from './middlewares/auth-middleware';
import accounts_router from './routes/api/admin/accounts';
import public_accounts_router from './routes/api/public/accounts';
import { openai } from './lib/openai';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Google AI SDK

//----------------------------------
//			app config
//----------------------------------

const app = express();

const server = createServer(app);

const port = Number(process.env.PORT) || 8000;

const wss = new WebSocketServer({ server });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(
	cors({
		origin: ['exp://', 'http://localhost:3000', 'http://localhost:8081'],
		methods: ['GET', 'POST', 'PUT', 'DELETE'],
		credentials: true,
	})
);

//----------------------------------
//			better-auth middleware
//----------------------------------

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

//----------------------------------
//			express routes
//----------------------------------

// yet to add auth middleware to verify users and add the history to the database

app.use('/api', accounts_router);
app.use('/api', public_accounts_router);

app.post('/chat', async (req, res) => {
	const userMessage = req.body.message;
	const sensorData = req.body.sensorData || {};

	if (!userMessage) {
		res.status(400).json({ error: 'Message is required' });
	}

	console.log(`Received message: "${userMessage}"`);

	try {
		const model = genAI.getGenerativeModel({
			model: 'gemini-2.0-flash',
			generationConfig: {
				temperature: 0.7,
				topK: 40,
				topP: 0.9,
				maxOutputTokens: 512,
			},
		});

		// System instruction + sensor context + user query
		const contextPrompt = `
You are an air quality assistant. Respond only to questions related to air quality, air pollution, gas safety, ventilation, or environmental health.

If the user asks something unrelated (like weather, sports, history), politely redirect them to air quality topics.

Current sensor readings:
- CO₂: ${sensorData.co2 || 'unknown'} ppm
- NH₃: ${sensorData.nh3 || 'unknown'} ppm

User says: "${userMessage}"
`;

		const result = await model.generateContentStream(contextPrompt);

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');

		const stream = result.stream;

		let fullText = '';

		for await (const chunk of stream) {
			const text = chunk.text();
			if (text) {
				fullText += text;
				res.write(`data: ${text}\n\n`);
			}
		}

		res.end();
	} catch (error) {
		console.error('Error calling Gemini API:', error);
		res.status(500).json({
			error: 'Failed to get a response from the AI. Please try again later.',
		});
	}
});

//----------------------------------
//			websockets
//----------------------------------

const users = new Map();

// pg_client.connect((err, client, release) => {
// 	if (err) {
// 		console.error('Error connecting to PostgreSQL:', err);
// 		return;
// 	}
// 	console.log('Connected to PostgreSQL');

// 	client
// 		.query('LISTEN new_health_data_channel')
// 		.then(() => {
// 			console.log('Listening to new_health_data_channel channel');
// 		})
// 		.catch((err) => {
// 			console.error('Error listening to new_health_data_channel channel:', err);
// 		});

// 	client.on('notification', (msg) => {
// 		const payload = JSON.parse(msg.payload);
// 		console.log('Received notification:', payload);

// 		wss.clients.forEach((ws) => {
// 			if (ws.readyState === ws.OPEN) {
// 				ws.send(JSON.stringify(payload));
// 			}
// 		});
// 	});
// });

wss.on('connection', async (ws, req) => {
	const { userId } = url.parse(req.url, true).query;

	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (!session) return ws.close();

	users.set(userId, session.user.email);

	console.log('\x1b[36m%s\x1b[0m', `clients: ${users.get(userId)}`);

	ws.send(`welcome ${users.get(userId)}`);

	ws.on('message', (message) => {
		ws.send(`message sent ${message}`);
	});

	ws.on('close', (code, reason) => {
		console.log(`code of the disconnected client is ${code}`);
		console.log(`-----------------------------------------`);
		console.log(`reason of the disconnected client is ${reason.valueOf()}`);

		users.delete(userId);
	});
});

server.listen(port, '0.0.0.0', () => {
	console.log(`Server running on http://localhost:${port}`);
});
