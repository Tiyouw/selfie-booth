import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db';
import { loadConfig } from './config';
import { openDb } from './db';

/** Delete every expired design row and its blob file. Returns removed count. */
export function expireDesigns(db: Db, dataDir: string, nowMs = Date.now()): number {
  const rows = db
    .prepare('SELECT id FROM designs WHERE expires_at <= ?')
    .all(Math.floor(nowMs / 1000)) as Array<{ id: string }>;
  if (rows.length === 0) return 0;
  const remove = db.prepare('DELETE FROM designs WHERE id = ?');
  db.transaction((ids: string[]) => {
    for (const id of ids) remove.run(id);
  })(rows.map((r) => r.id));
  for (const { id } of rows) {
    rmSync(join(dataDir, 'blobs', `${id}.gif`), { force: true });
  }
  return rows.length;
}

// Standalone cleanup entry: node dist/server/src/expire.js (systemd timer).
if (require.main === module) {
  const config = loadConfig();
  const db = openDb(config.dataDir);
  const removed = expireDesigns(db, config.dataDir);
  console.log(`selfie-booth: expired ${removed} design(s)`);
  db.close();
}
