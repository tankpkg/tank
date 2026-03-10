import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/admin-middleware';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serviceAccounts } from '@/lib/db/schema';

function parseServiceAccountId(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('service-accounts');
  if (idx === -1 || idx + 1 >= segments.length) return null;
  return segments[idx + 1];
}

const allowedScopes = new Set(['skills:read', 'skills:publish', 'skills:admin']);

function normalizeScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return ['skills:read'];
  }

  const scopes = Array.from(
    new Set(
      raw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0 && allowedScopes.has(value))
    )
  );

  if (scopes.includes('skills:admin') && !scopes.includes('skills:read')) {
    scopes.push('skills:read');
  }

  return scopes.length > 0 ? scopes : ['skills:read'];
}

export const POST = withAdminAuth(async (req: NextRequest): Promise<NextResponse> => {
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

  const { keyName, scopes, expiresInDays } = body as Record<string, unknown>;
  const normalizedScopes = normalizeScopes(scopes);
  const keyExpiresInDays =
    typeof expiresInDays === 'number' && Number.isFinite(expiresInDays)
      ? Math.max(1, Math.min(365, Math.floor(expiresInDays)))
      : 30;

  const [serviceAccount] = await db
    .select({
      id: serviceAccounts.id,
      userId: serviceAccounts.userId,
      displayName: serviceAccounts.displayName,
      disabled: serviceAccounts.disabled
    })
    .from(serviceAccounts)
    .where(eq(serviceAccounts.id, id))
    .limit(1);

  if (!serviceAccount) {
    return NextResponse.json({ error: 'Service account not found' }, { status: 404 });
  }

  if (serviceAccount.disabled) {
    return NextResponse.json({ error: 'Service account is disabled' }, { status: 400 });
  }

  const keyResult = await auth.api.createApiKey({
    body: {
      name:
        typeof keyName === 'string' && keyName.trim().length > 0 ? keyName.trim() : `${serviceAccount.displayName} key`,
      userId: serviceAccount.userId,
      expiresIn: keyExpiresInDays * 24 * 60 * 60,
      permissions: JSON.stringify(normalizedScopes),
      metadata: JSON.stringify({ serviceAccountId: serviceAccount.id })
    } as never
  });

  return NextResponse.json({ apiKey: keyResult, scopes: normalizedScopes });
});
