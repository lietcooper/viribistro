// Vitest global setup file — loaded before any test file.
// Loads .env.test so DATABASE_URL points at the isolated test database.
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../.env.test') });
