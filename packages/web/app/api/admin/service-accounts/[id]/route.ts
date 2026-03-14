import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import { withAdminAuth } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { serviceAccounts } from '@/lib/db/schema';

function parseServiceAccountId(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('service-accounts');
  if (idx === -1 || idx + 1 >= segments.length) return null;
  return segments[idx + 1];
}

export const PATCH = withAdminAuth(async (req: NextRequest): Promise<NextResponse> => {
  const id = parseServiceAccountId(req);
  if (!id) {
    return NextResponse.json({ error: 'Route context missing' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { disabled } = body as Record<string, unknown>;
  if (typeof disabled !== 'boolean') {
    return NextResponse.json({ error: 'disabled must be a boolean' }, { status: 400 });
  }

  const result = await db
    .update(serviceAccounts)
    .set({ disabled })
    .where(eq(serviceAccounts.id, id))
    .returning({ id: serviceAccounts.id, disabled: serviceAccounts.disabled });

  if (result.length === 0) {
    return NextResponse.json({ error: 'Service account not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, serviceAccount: result[0] });
});
