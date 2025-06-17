// sensorPoller.ts
import WebSocket from 'ws';
import db from '../../database/db';

let lastCheckTime = new Date();

export function startSensorPolling(wsClients: Map<string, WebSocket>) {
	setInterval(async () => {
		try {
			const newReadings = await db.gas_data.findMany({
				where: {
					timestamp: {
						gt: lastCheckTime,
					},
				},
				orderBy: {
					timestamp: 'desc',
				},
			});

			if (newReadings.length > 0) {
				lastCheckTime = new Date(); // Update checkpoint

				newReadings.forEach((reading) => {
					const message = JSON.stringify({
						type: 'sensor-update',
						payload: reading,
					});

					wsClients.forEach((ws) => {
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(message);
						}
					});
				});
			}
		} catch (err) {
			console.error('[Polling error]', err);
		}
	}, 5000); // every 5 seconds
}
