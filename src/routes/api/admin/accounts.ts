import express from 'express';
import db from '../../../database/db';
import isAdminMiddleware from '../../../middlewares/is-admin-middleware';

const accounts_router = express.Router();

accounts_router.use(isAdminMiddleware);

accounts_router.get('/all-accounts', async (_, res) => {
	const users = await db.user.findMany({
		include: {
			Disease: true,
			UserInfo: true,
		},
		where: {
			role: {
				not: 'ADMIN',
			},
		},
	});

	res.status(200).json({
		users,
	});
});

accounts_router.post('/verify-account', async (req, res) => {
	const body = req.body;

	const id = body?.id as string;

	console.log(id);

	if (!id)
		res.json(400).json({
			message: 'no id provided.',
		});

	const user = await db.user.findUnique({
		where: {
			id,
		},
	});

	if (!user)
		res.json(400).json({
			message: "user doesn't exist.",
		});

	if (user.emailVerified)
		res.status(400).json({ message: 'user already verified.' });

	await db.user.update({
		where: {
			id: id,
		},
		data: {
			emailVerified: true,
		},
	});

	res.status(200).json({
		message: 'user verified.',
	});
});

accounts_router.post('/delete-account', async (req, res) => {
	const { id } = req.body;

	if (!id)
		res.json(400).json({
			message: 'no id provided.',
		});

	const user = await db.user.findUnique({
		where: {
			id,
		},
	});

	if (!user)
		res.json(400).json({
			message: "user doesn't exist.",
		});

	// await db.user.delete({
	// 	where: {
	// 		id,
	// 	},
	// });

	res.status(200).json({
		message: 'user deleted successfully.',
	});
});

export default accounts_router;
