import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isUserBlocked } from '@/lib/auth-helpers';
import { authorizeSession, getSession } from '@/lib/cli-auth-store';
import { headers } from 'next/headers';
import { authLog } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    authLog.info({ action: 'authorize' }, 'CLI auth authorize request received');

    // Verify the user is authenticated via session cookie
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    authLog.info({ action: 'authorize', userId: session?.user?.id, hasSession: !!session }, 'Auth session check');

    if (!session?.user?.id) {
      authLog.warn({ action: 'authorize' }, 'No authenticated session found');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (await isUserBlocked(session.user.id)) {
      return NextResponse.json(
        { error: 'Account is suspended or banned' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sessionCode } = body;

    authLog.info({ action: 'authorize', sessionCode: sessionCode?.slice(0, 8) + '...' }, 'Authorize attempt for session');

    if (!sessionCode || typeof sessionCode !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: sessionCode' },
        { status: 400 }
      );
    }

    // Check session exists
    const cliSession = getSession(sessionCode);
    if (!cliSession) {
      authLog.warn({ action: 'authorize', sessionCode: sessionCode?.slice(0, 8) + '...' }, 'Session not found or expired');
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 404 }
      );
    }

    // Authorize the session with user info for later retrieval
    const success = authorizeSession(sessionCode, session.user.id, {
      name: session.user.name,
      email: session.user.email,
    });
    if (!success) {
      authLog.error({ action: 'authorize', sessionCode: sessionCode.slice(0, 8) + '...' }, 'Session authorization failed');
      return NextResponse.json(
        { error: 'Session could not be authorized' },
        { status: 400 }
      );
    }

    authLog.info({ action: 'authorize', sessionCode: sessionCode.slice(0, 8) + '...', userId: session.user.id }, 'Session authorized successfully');

    return NextResponse.json({ success: true });
  } catch (err) {
    authLog.error({ action: 'authorize', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, 'CLI auth authorize failed');
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
