import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeState } from '../../lib/state';
import type { Config } from './config';
import { openDb, type Db, type DesignRow } from './db';
import { hashToken, randomId, randomToken } from './ids';
import { createRateLimiter } from './ratelimit';
import { renderOgPng } from './render';

export interface AppDeps {
  config: Config;
  db: Db;
  /** POSTs per hour per IP before 429 (tests lower this). */
  postLimit?: number;
}

const ID_PATTERN = /^[A-Za-z0-9]{8}$/;

function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('x-real-ip') ?? 'unknown';
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function getDesignRow(db: Db, id: string): DesignRow | undefined {
  if (!ID_PATTERN.test(id)) return undefined;
  return db.prepare('SELECT * FROM designs WHERE id = ?').get(id) as DesignRow | undefined;
}

function jsonError(c: Context, status: 400 | 403 | 404 | 410 | 413 | 429 | 500, error: string, message: string) {
  return c.json({ error, message }, status);
}

export function buildApp({ config, db, postLimit = 20 }: AppDeps) {
  const app = new Hono();
  const postLimiter = createRateLimiter(postLimit, 3_600_000);

  const corsHeaders = (origin: string | undefined, vary: boolean) => {
    const headers: Record<string, string> = vary ? { Vary: 'Origin' } : {};
    if (origin && config.allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST, DELETE, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Delete-Token';
      headers['Access-Control-Max-Age'] = '600';
    }
    return headers;
  };

  // Hand-rolled CORS: only allowlisted origins ever get an ACAO header.
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204, corsHeaders(origin, false));
    }
    await next();
    if (origin) {
      for (const [key, value] of Object.entries(corsHeaders(origin, true))) c.header(key, value);
    }
  });

  app.onError((err, c) => {
    console.error(err);
    return jsonError(c, 500, 'internal', 'Kesalahan server.');
  });
  app.notFound((c) => jsonError(c, 404, 'not_found', 'Endpoint tidak ditemukan.'));

  app.get('/v1/health', (c) => c.json({ ok: true }));

  app.post('/v1/designs', async (c) => {
    if (!postLimiter.take(clientIp(c))) {
      return jsonError(c, 429, 'rate_limited', 'Terlalu banyak permintaan. Coba lagi nanti.');
    }
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > config.maxBodyBytes) {
      return jsonError(c, 413, 'too_large', `Body melebihi ${Math.round(config.maxBodyBytes / 1024 / 1024)} MB.`);
    }

    let body: Record<string, string | File>;
    try {
      body = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      return jsonError(c, 400, 'bad_request', 'Body harus multipart/form-data.');
    }
    const design = body.design;
    if (typeof design !== 'string' || design.length === 0) {
      return jsonError(c, 400, 'bad_request', 'Field design wajib berupa string JSON.');
    }
    if (design.length > config.maxDesignBytes) {
      return jsonError(c, 413, 'too_large', `Design melebihi ${Math.round(config.maxDesignBytes / 1024 / 1024)} MB.`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(design);
    } catch {
      return jsonError(c, 400, 'invalid_payload', 'Design bukan JSON valid.');
    }
    if (!sanitizeState(payload)) {
      return jsonError(c, 400, 'invalid_payload', 'Design tidak memenuhi skema v1/v2/v3.');
    }

    let gif: File | null = null;
    if (body.gif !== undefined) {
      if (!(body.gif instanceof File)) {
        return jsonError(c, 400, 'bad_request', 'Field gif harus berupa file.');
      }
      if (body.gif.type !== 'image/gif') {
        return jsonError(c, 400, 'bad_request', 'GIF harus berupa image/gif.');
      }
      if (body.gif.size > config.maxGifBytes) {
        return jsonError(c, 413, 'too_large', 'GIF melebihi 8 MB.');
      }
      gif = body.gif;
    }

    const createdAt = nowSec();
    const expiresAt = createdAt + config.ttlDays * 86_400;
    const deleteToken = randomToken();
    const blobPath = (id: string) => join(config.dataDir, 'blobs', `${id}.gif`);

    for (let attempt = 0; attempt < 5; attempt++) {
      const id = randomId();
      try {
        if (gif) await writeFile(blobPath(id), Buffer.from(await gif.arrayBuffer()));
        db.prepare(
          'INSERT INTO designs (id, payload, has_gif, created_at, expires_at, delete_token) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(id, design, gif ? 1 : 0, createdAt, expiresAt, hashToken(deleteToken));
        // Short links follow the booth's own domain when its origin is
        // allowlisted (multi-domain setups); otherwise the configured origin.
        const origin = c.req.header('origin');
        const linkOrigin = origin && config.allowedOrigins.includes(origin) ? origin : config.frontendOrigin;
        return c.json(
          {
            id,
            url: `${linkOrigin}/s/${id}`,
            gifUrl: gif ? `${c.req.url.split('/v1/')[0]}/v1/media/${id}.gif` : undefined,
            expiresAt,
            deleteToken,
          },
          201,
        );
      } catch (err) {
        const code = (err as NodeJS.ErrnoException & { code?: string })?.code;
        if (code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw err;
        await unlink(blobPath(id)).catch(() => {});
      }
    }
    return jsonError(c, 500, 'internal', 'Gagal membuat id unik.');
  });

  app.get('/v1/designs/:id', (c) => {
    const row = getDesignRow(db, c.req.param('id'));
    if (!row) return jsonError(c, 404, 'not_found', 'Design tidak ditemukan.');
    if (row.expires_at <= nowSec()) return jsonError(c, 410, 'expired', 'Link sudah kedaluwarsa.');
    // The stored payload verbatim, plus the GIF location when one exists.
    const body = { ...JSON.parse(row.payload) };
    if (typeof body === 'object' && body !== null && row.has_gif === 1) {
      (body as Record<string, unknown>).gifUrl = `${c.req.url.split('/v1/')[0]}/v1/media/${row.id}.gif`;
    }
    return c.body(JSON.stringify(body), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    });
  });

  app.get('/v1/designs/:id/og.png', async (c) => {
    const row = getDesignRow(db, c.req.param('id'));
    if (!row) return jsonError(c, 404, 'not_found', 'Design tidak ditemukan.');
    if (row.expires_at <= nowSec()) return jsonError(c, 410, 'expired', 'Link sudah kedaluwarsa.');
    const state = sanitizeState(JSON.parse(row.payload));
    if (!state) return jsonError(c, 500, 'internal', 'Payload tersimpan tidak valid.');
    const png = await renderOgPng(state);
    return c.body(png, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.get('/v1/media/:name', async (c) => {
    const match = /^([A-Za-z0-9]{8})\.gif$/.exec(c.req.param('name'));
    if (!match) return jsonError(c, 404, 'not_found', 'Media tidak ditemukan.');
    const row = getDesignRow(db, match[1]);
    if (!row || row.has_gif !== 1 || row.expires_at <= nowSec()) {
      return jsonError(c, 404, 'not_found', 'Media tidak ditemukan.');
    }
    let file: Buffer;
    try {
      file = await readFile(join(config.dataDir, 'blobs', `${row.id}.gif`));
    } catch {
      return jsonError(c, 404, 'not_found', 'Media tidak ditemukan.');
    }
    return c.body(file, 200, {
      'Content-Type': 'image/gif',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.delete('/v1/designs/:id', async (c) => {
    const row = getDesignRow(db, c.req.param('id'));
    if (!row) return jsonError(c, 404, 'not_found', 'Design tidak ditemukan.');
    const token = c.req.header('x-delete-token') ?? '';
    const given = Buffer.from(hashToken(token));
    const stored = Buffer.from(row.delete_token);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      return jsonError(c, 403, 'forbidden', 'Token hapus salah.');
    }
    db.prepare('DELETE FROM designs WHERE id = ?').run(row.id);
    await unlink(join(config.dataDir, 'blobs', `${row.id}.gif`)).catch(() => {});
    return c.body(null, 204);
  });

  return app;
}
