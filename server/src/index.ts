import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db';

const config = loadConfig();
const db = openDb(config.dataDir);
const app = buildApp({ config, db });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`selfie-booth-api listening on :${info.port}`);
});
