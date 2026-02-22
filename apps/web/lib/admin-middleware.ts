import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export interface AdminAuthContext {
  user: SessionData['user'];
  session: SessionData['session'];
}

export async function requireAdmin(): Promise<AdminAuthContext | NextResponse> {
  const sessionData = await auth.api.getSession({
    headers: await headers(),
  });

  if (!sessionData) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const dbUser = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, sessionData.user.id))
    .limit(1);

  if (dbUser.length === 0) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  if (dbUser[0].role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  return {
    user: sessionData.user,
    session: sessionData.session,
  };
}

export function withAdminAuth<T, TRouteContext = unknown>(
  handler: (
    req: NextRequest,
    context: AdminAuthContext,
    routeContext?: TRouteContext,
  ) => Promise<NextResponse<T>>
): (req: NextRequest, routeContext?: TRouteContext) => Promise<NextResponse> {
  return async (req: NextRequest, routeContext?: TRouteContext) => {
    const authResult = await requireAdmin();

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    return handler(req, authResult, routeContext);
  };
}
