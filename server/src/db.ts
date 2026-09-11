import Database from 'better-sqlite3';
import { join } from 'node:path';

export type Db = Database.Database;

export interface DesignRow {
  id: string;
  payload: string;
  has_gif: 0 | 1;
  created_at: number;
  expires_at: number;
  /** sha256 hex of the delete token. */
  delete_token: string;
}

export function openDb(dataDir: string): Db {
  const db = new Database(join(dataDir, 'meta.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS designs (
      id           TEXT PRIMARY KEY,
      payload      TEXT NOT NULL,
      has_gif      INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL,
      delete_token TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_designs_expires ON designs(expires_at);
  `);
  return db;
}
