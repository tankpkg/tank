import * as fs from 'node:fs';
import { Hono } from 'hono';

import { getFilesystemProvider } from '~/services/storage/provider';

export const storageRoutes = new Hono()
  .get('/download', async (c) => {
    const fsProvider = getFilesystemProvider();
    if (!fsProvider) return c.json({ error: 'Filesystem storage not configured' }, 404);

    const path = c.req.query('path');
    const expires = c.req.query('expires');
    const token = c.req.query('token');

    if (!path || !expires || !token) return c.json({ error: 'Missing parameters' }, 400);
    if (!fsProvider.verifyToken(path, expires, token)) return c.json({ error: 'Invalid or expired token' }, 403);

    const filePath = fsProvider.getFilePath(path);
    if (!fs.existsSync(filePath)) return c.json({ error: 'File not found' }, 404);

    const data = fs.readFileSync(filePath);
    const ext = path.split('.').pop() || '';
    const contentType = ext === 'tgz' ? 'application/gzip' : 'application/octet-stream';

    return new Response(data, { headers: { 'Content-Type': contentType, 'Content-Length': data.length.toString() } });
  })

  .put('/upload', async (c) => {
    const fsProvider = getFilesystemProvider();
    if (!fsProvider) return c.json({ error: 'Filesystem storage not configured' }, 404);

    const path = c.req.query('path');
    const expires = c.req.query('expires');
    const token = c.req.query('token');

    if (!path || !expires || !token) return c.json({ error: 'Missing parameters' }, 400);
    if (!fsProvider.verifyToken(path, expires, token)) return c.json({ error: 'Invalid or expired token' }, 403);

    const body = await c.req.arrayBuffer();
    await fsProvider.putObject(path, new Uint8Array(body));

    return c.json({ ok: true });
  });
