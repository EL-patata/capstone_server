import { betterAuth } from 'better-auth';
import { expo } from '@better-auth/expo';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import db from '../database/db';

export const auth = betterAuth({
	database: prismaAdapter(db, {
		provider: 'postgresql',
	}),

	emailAndPassword: {
		enabled: true,
	},

	plugins: [expo()],

	trustedOrigins: [
		'myapp://',
		'http://localhost:3000',
		'http://localhost:8081',
	],
});
