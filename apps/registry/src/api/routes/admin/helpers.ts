import type { Context } from 'hono';

export function parsePagination(c: Context) {
  const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') || '20', 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function getAdminUserId(c: Context): string {
  return (c.get('adminUser' as never) as { id: string }).id;
}
