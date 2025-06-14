import type { NextFunction, Request, Response } from 'express';
import db from '../database/db';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';

export default async function authMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
) {
	// const token = req.headers.authorization;

	// if (!token)
	// 	res.status(400).json({
	// 		message: 'no token found.',
	// 	});

	// const session = await db.session.findFirst({
	// 	where: {
	// 		token,
	// 	},
	// });

	// if (!session) res.status(401);

	// const validSession = session?.expiresAt.getTime() > Date.now();

	const validSession = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (validSession) {
		next();
	} else {
		res.status(401).json({
			message: 'not authenticated.',
		});
	}
}
