import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Config {
  port: number;
  /** Directory holding meta.sqlite + blobs/ */
  dataDir: string;
  /** Public frontend origin used to build share URLs. */
  frontendOrigin: string;
  /** Origins allowed to POST/DELETE (CORS). GET stays public. */
  allowedOrigins: string[];
  ttlDays: number;
  /** Whole multipart body ceiling (design JSON + gif). */
  maxBodyBytes: number;
  /** `design` JSON string ceiling. */
  maxDesignBytes: number;
  /** GIF upload ceiling. */
  maxGifBytes: number;
}

function intEnv(env: Partial<Record<string, string | undefined>>, key: string, fallback: number): number {
  const n = Number(env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: Partial<Record<string, string | undefined>> = process.env): Config {
  const dataDir = env.DATA_DIR ?? '/var/lib/selfie-booth';
  mkdirSync(join(dataDir, 'blobs'), { recursive: true });
  return {
    port: intEnv(env, 'PORT', 8787),
    dataDir,
    frontendOrigin: (env.FRONTEND_ORIGIN ?? 'https://selfie.tiyoouw.app').replace(/\/$/, ''),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? env.FRONTEND_ORIGIN ?? 'https://selfie.tiyoouw.app')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
    ttlDays: intEnv(env, 'TTL_DAYS', 30),
    maxBodyBytes: intEnv(env, 'MAX_BODY_MB', 16) * 1024 * 1024,
    maxDesignBytes: 12 * 1024 * 1024,
    maxGifBytes: 8 * 1024 * 1024,
  };
}
