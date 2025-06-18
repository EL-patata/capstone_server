import express from 'express';
import db from '../../../database/db';

const register_router = express.Router();

register_router.post('/fill-user-information', async (req, res) => {
	const body = req.body;

	const { id, dateOfBirth, district, height, phoneNumber, diseases } =
		body.information as {
			id: string;
			dateOfBirth: Date;
			height: number;
			phoneNumber: string;
			district: string;
			diseases?: string[];
		};

	const formattedDiseases: { userId: string; id: string; disease: string }[] =
		diseases.map((disease) => {
			return {
				userId: id,
				id: id,
				disease,
			};
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

	if (district === 'medical staff')
		await db.user.update({
			where: {
				id,
			},
			data: {
				role: 'MEDICAL_STAFF',
			},
		});

	if (diseases.length !== 0 || !diseases)
		await db.disease.createMany({
			data: formattedDiseases,
		});

	res.status(200).json({
		message: 'information added successfully.',
	});
});

export default register_router;
