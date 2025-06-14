import express from 'express';
import authMiddleware from '../../middlewares/auth-middleware';

const health_data_router = express.Router();

health_data_router.use(authMiddleware);

health_data_router.get('/get-data', (req, res) => {
	res.status(200).json({
		message: 'user authenticated',
	});
});

export default health_data_router;
