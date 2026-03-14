import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import { withAdminAuth } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { apikey } from '@/lib/db/auth-schema';
import { serviceAccounts } from '@/lib/db/schema';

function parseParams(req: NextRequest): { id: string; keyId: string } | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('service-accounts');
  if (idx === -1 || idx + 3 >= segments.length) return null;
  return { id: segments[idx + 1], keyId: segments[idx + 3] };
}

export const DELETE = withAdminAuth(async (req: NextRequest): Promise<NextResponse> => {
  const parsed = parseParams(req);
  if (!parsed) {
    return NextResponse.json({ error: 'Route context missing' }, { status: 400 });
  }
  const { id, keyId } = parsed;

  const [serviceAccount] = await db
    .select({ userId: serviceAccounts.userId })
    .from(serviceAccounts)
    .where(eq(serviceAccounts.id, id))
    .limit(1);

  if (!serviceAccount) {
    return NextResponse.json({ error: 'Service account not found' }, { status: 404 });
  }

  const updated = await db
    .update(apikey)
    .set({ enabled: false })
    .where(and(eq(apikey.id, keyId), eq(apikey.userId, serviceAccount.userId)))
    .returning({ id: apikey.id, enabled: apikey.enabled });

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, key: updated[0] });
});
