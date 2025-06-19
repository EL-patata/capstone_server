import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import url, { parse } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { auth } from './lib/auth';
import authMiddleware from './middlewares/auth-middleware';
import accounts_router from './routes/api/admin/accounts';
import public_accounts_router from './routes/api/public/accounts';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Google AI SDK
import db from './database/db';
import register_router from './routes/api/public/register';
import { pg_client } from './database/pg-client';
import bodyParser from 'body-parser';
import axios from 'axios';
import { startSensorPolling } from './routes/websocket/send-gas-data';
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

/*
	returns
	messages: {
    id: string;
    text: string;
    isUserMessage: boolean;
    created_at: Date;
    userId: string;
    readingId: number;
    gas_dataId: number;
}[]
*/
app.get('/my-chat', async (req, res) => {
	const { id } = parse(req.url, true).query;

	const messages = await db.chat.findMany({
		where: {
			userId: id as string,
		},
		orderBy: {
			created_at: 'asc',
		},
	});

	res.status(200).json({
		messages,
	});
});
/*
	returns nothing.
	updates the user's profile picture
*/
app.post('/api/profile-picture', async (req, _) => {
	const imageUrl = req.body.imageUrl as string;
	const userId = req.body.userId as string;

	await db.user.update({
		where: {
			id: userId,
		},
		data: {
			image: imageUrl,
			updatedAt: new Date(),
		},
	});
});

/*
returns
reading: {
    id: number;
    timestamp: Date;
    co2: number;
    nh3: number;
    alcohol: number;
    toluene: number;
    acetone: number;
    lpg: number;
    co: number;
    smoke: number;
}
*/
app.get('/latest-reading', async (_, res) => {
	const reading = await db.gas_data.findFirst({
		orderBy: {
			timestamp: 'desc',
		},
	});

	res.status(200).json({
		reading,
	});
});

app.get('/latest-wearable-reading', async (req, res) => {
	const { id } = parse(req.url, true).query;

	if (!id)
		res.status(404).json({
			message: 'no user id provided.',
		});

	const wearable = await db.sensors.findFirst({
		where: {
			user_id: id as string,
		},
	});

	if (!wearable)
		res.status(200).json({ message: 'no wearable found.', reading: {} });

	const reading = await db.new_health_data.findFirst({
		where: {
			sensor_id: wearable.id,
		},
		orderBy: {
			timestamp: 'desc',
		},
	});

	res.status(200).json({
		reading,
		message: 'wearable found.',
	});
});

app.get('/non-connected-wearables', async (req, res) => {
	const nonConnectedUsers = await db.user.findMany({
		where: {
			role: {
				not: 'ADMIN',
			},
			sensors: {
				is: null,
			},
		},
	});

	const nonConnectedDevices = await db.sensors.findMany({
		where: {
			user_id: {
				equals: null,
			},
		},
	});

	const connectedUsers = await db.user.findMany({
		where: {
			role: {
				not: 'ADMIN',
			},
			sensors: {
				user_id: { not: null },
			},
		},
	});

	res
		.status(200)
		.json({ connectedUsers, nonConnectedUsers, nonConnectedDevices });
});

app.post('/connect-wearable', async (req, res) => {
	const userId = req.body.userId as string;
	if (!userId) res.status(401).json({ message: 'no user id provided.' });

	const sensor = await db.sensors.findFirst({
		where: {
			user_id: null,
		},
	});
	if (!sensor) res.status(404).json({ message: 'all sensors are connected.' });

	await db.sensors.update({
		where: {
			id: sensor.id,
		},
		data: {
			user_id: userId,
		},
	});

	res.status(200).json({ message: 'connected successfully.' });
});

app.post('/admin-sign', async (req, res) => {
	const { email, password } = req.body;

	const isAdmin = await db.user.findUnique({
		where: {
			email,
		},
	});

	console.log(isAdmin);

	if (isAdmin.role !== 'ADMIN')
		res.status(403).json({
			message: 'useless message.',
		});
	else {
		res.status(200).json({
			message: 'useless message.',
		});
	}
});

app.post('/emergency', async (req, res) => {
	const { userId } = req.body;

	await db.alert.create({
		data: {
			user_id: userId as string,
			id: `${Date.now().toString()}__${userId}`,
		},
	});

	res.status(200).json({ message: 'alert sent.' });
});

app.get('/alerts', async (req, res) => {
	const alerts = await db.alert.findMany({
		select: {
			created_at: true,
			user: {
				select: {
					email: true,
					name: true,
					image: true,
				},
			},
		},
	});

	res.status(200).json({
		alerts,
	});
});

/*
	everything related to a user
	returns
	user: {
    Disease: {
        id: string;
        userId: string;
        disease: string;
    }[];
    UserInfo: {
        id: string;
        dateOfBirth: Date;
        district: string;
        height: number;
        phoneNumber: string;
    };
} & {
	......
}
*/
app.get('/account', async (req, res) => {
	const { id } = parse(req.url, true).query;

	if (!id)
		res.status(400).json({
			message: 'no user id provided.',
		});

	const user = await db.user.findUnique({
		where: {
			id: id as string,
		},
		include: {
			Disease: true,
			UserInfo: true,
		},
	});

	if (!user)
		res.status(404).json({
			message: 'no user found.',
		});

	res.status(200).json({
		user,
	});
});

/*
	the chat bot 
	returns
	message: string*/

app.post('/chat', async (req, res) => {
	const userMessage = req.body.message as string;
	const userId = req.body.userId as string;

	if (!userMessage) {
		res.status(400).json({ message: 'Not enough info.' });
	}

	const latestReading = await db.gas_data.findFirst({
		orderBy: {
			timestamp: 'desc',
		},
	});

	// Save user message
	await db.chat.create({
		data: {
			text: userMessage,
			isUserMessage: true,
			userId,
			readingId: latestReading?.id ?? 2,
		},
	});

	const conditions = await db.disease.findMany({
		where: {
			userId,
		},
	});

	const readings = await db.new_health_data.findFirst({
		where: {
			sensors: {
				user_id: userId,
			},
		},
		orderBy: {
			timestamp: 'desc',
		},
	});

	const mappedConditions = conditions
		.map((condition) => condition.disease)
		.join(', ');

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

		let contextPrompt = `
You are an air quality assistant designed to help users in industrial or factory environments. Your expertise includes air pollution, gas detection, ventilation safety, and environmental health.

You have full access to the user's medical conditions, which are **explicitly shared and non-private** for the purpose of personalized advice. You should use this data to **inform your health-related air quality responses**, and you are allowed to reference them when relevant.

Do not refuse to use or mention the medical conditions. Do not say they are private or restricted — they are not.

Current sensor readings:
- CO₂: ${latestReading?.co2 ?? 'unknown'} ppm
- NH₃: ${latestReading?.nh3 ?? 'unknown'} ppm
- SMOKE: ${latestReading?.smoke ?? 'unknown'} ppm
- ALCOHOL: ${latestReading?.alcohol ?? 'unknown'} ppm
- CO: ${latestReading?.co ?? 'unknown'} ppm

The user's known medical conditions are: ${mappedConditions}

here is the user's spo2 reading ${readings.spo2}

here is the user's heart rate reading ${readings.heart_rate}

If the user asks a question unrelated to air quality (like weather, sports, or history), politely guide them back to relevant topics.

User says: "${userMessage}"
`;

		if (!readings)
			contextPrompt = `
You are an air quality assistant designed to help users in industrial or factory environments. Your expertise includes air pollution, gas detection, ventilation safety, and environmental health.

You have full access to the user's medical conditions, which are **explicitly shared and non-private** for the purpose of personalized advice. You should use this data to **inform your health-related air quality responses**, and you are allowed to reference them when relevant.

Do not refuse to use or mention the medical conditions. Do not say they are private or restricted — they are not.

Current sensor readings:
- CO₂: ${latestReading?.co2 ?? 'unknown'} ppm
- NH₃: ${latestReading?.nh3 ?? 'unknown'} ppm
- SMOKE: ${latestReading?.smoke ?? 'unknown'} ppm
- ALCOHOL: ${latestReading?.alcohol ?? 'unknown'} ppm
- CO: ${latestReading?.co ?? 'unknown'} ppm

The user's known medical conditions are: ${mappedConditions}

If the user asks a question unrelated to air quality (like weather, sports, or history), politely guide them back to relevant topics.

User says: "${userMessage}"
`;

		const result = await model.generateContentStream(contextPrompt);

		let fullText = '';

		for await (const chunk of result.stream) {
			const text = chunk.text();
			if (text) fullText += text;
		}

		// Save AI response
		await db.chat.create({
			data: {
				text: fullText,
				isUserMessage: false,
				userId,
				readingId: latestReading?.id ?? 2,
			},
		});

		res.json({ reply: fullText });
	} catch (error) {
		console.error('Error calling Gemini API:', error);
		res.status(500).json({
			error: 'Failed to get a response from the AI. Please try again later.',
		});
	}
});

app.use('/api', accounts_router);
app.use('/api', public_accounts_router);
app.use('/register', register_router);

app.use(bodyParser.json());

//----------------------------------
//			websockets
//----------------------------------

const clients = new Map<string, WebSocket>();

wss.on('connection', async (ws, req) => {
	const { id } = url.parse(req.url, true).query;

	if (!id) return;

	const userId = id as string;

	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (!session) return;

	clients.set(userId, ws);

	console.log(`client: `, userId);

	ws.on('close', () => {
		clients.delete(userId);
	});
});

startSensorPolling(clients);

server.listen(port, '0.0.0.0', () => {
	console.log(`Server running on http://localhost:${port}`);
});
