import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { auth } from './lib/auth';

const app = express();

const port = Number(process.env.PORT) || 8000;

app.use(
	cors({
		origin: ['exp://', 'http://localhost:3000', 'http://localhost:8081'],
		methods: ['GET', 'POST', 'PUT', 'DELETE'],
		credentials: true,
	})
);

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json());

app.get('/', (req, res) => {
	res.json({ message: 'welcome!' });
});

app.listen(port, '0.0.0.0', () => {
	console.log(`Server running on http://localhost:${port}`);
});
