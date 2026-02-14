import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authorizeSession, getSession } from '@/lib/cli-auth-store';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  try {
    // Verify the user is authenticated via session cookie
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionCode } = body;

    if (!sessionCode || typeof sessionCode !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: sessionCode' },
        { status: 400 }
      );
    }

    // Check session exists
    const cliSession = getSession(sessionCode);
    if (!cliSession) {
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
      return NextResponse.json(
        { error: 'Session could not be authorized' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
