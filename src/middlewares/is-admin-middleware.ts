import type { NextFunction, Request, Response } from 'express';
import db from '../database/db';

export default async function isAdminMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const token = req.headers.authorization;

	if (!token)
		res.status(400).json({
			message: 'no token found.',
		});

	const session = await db.session.findFirst({
		where: {
			token,
		},
	});

	const user = await db.user.findUnique({
		where: {
			id: session.userId,
		},
	});

	if (!session) res.status(401);

	const validSession = session?.expiresAt.getTime() > Date.now();

	if (validSession && user.role === 'USER') {
		next();
	} else {
		res.status(401).json({
			message: 'not authorized.',
		});
	}
}
