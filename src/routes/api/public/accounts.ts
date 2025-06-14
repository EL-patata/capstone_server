import express from 'express';
import { parse } from 'url';
import db from '../../../database/db';
import authMiddleware from '../../../middlewares/auth-middleware';

const public_accounts_router = express.Router();

public_accounts_router.use(authMiddleware);

public_accounts_router.get('/account', async (req, res) => {
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

public_accounts_router.post('/fill-user-information', async (req, res) => {
	const body = req.body;

	const { id, dateOfBirth, district, height, phoneNumber, diseases } =
		body.information as {
			id: string;
			dateOfBirth: Date;
			height: number;
			phoneNumber: string;
			district: string;
			diseases?: { disease: string; userId: string; id: string }[];
		};

	diseases.forEach((disease) => {
		disease.userId = id;
		disease.id = id;
	});

	if (!id || !dateOfBirth || !district || !height || !phoneNumber)
		res.status(400).json({
			message: 'missing data.',
		});

	await db.userInfo.create({
		data: {
			id,
			dateOfBirth,
			height,
			phoneNumber,
			district,
		},
	});

	if (diseases.length !== 0 || !diseases)
		await db.disease.createMany({
			data: diseases,
		});

	res.status(200).json({
		message: 'information added successfully.',
	});
});

export default public_accounts_router;
