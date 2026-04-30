// tests/setup.js
// Carrega .env.test antes de cada arquivo de teste rodar.
// Necessário para que módulos como redisService.js leiam REDIS_PREFIX no top-level.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });
