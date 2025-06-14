import { Pool } from 'pg';

export const pg_client = new Pool({
	connectionString: process.env.DATABASE_URL,
});
