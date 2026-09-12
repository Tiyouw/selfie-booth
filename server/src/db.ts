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

export interface FrameRow {
  id: string;
  name: string;
  ratio: string;
  grid: number;
  /** JSON-encoded Inset. */
  inset: string;
  png: Buffer;
  size: number;
  created_at: number;
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
    CREATE TABLE IF NOT EXISTS frames (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      ratio      TEXT NOT NULL,
      grid       INTEGER NOT NULL,
      inset      TEXT NOT NULL,
      png        BLOB NOT NULL,
      size       INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_frames_created ON frames(created_at);
  `);
  return db;
}
