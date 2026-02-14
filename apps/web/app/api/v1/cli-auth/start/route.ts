import { NextResponse } from 'next/server';
import { createSession } from '@/lib/cli-auth-store';
import { authLog } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { state } = body;

    authLog.info({ action: 'start', state: state?.slice(0, 8) + '...' }, 'CLI auth start request received');

    if (!state || typeof state !== 'string') {
      authLog.warn({ action: 'start' }, 'Missing state parameter');
      return NextResponse.json(
        { error: 'Missing required field: state' },
        { status: 400 }
      );
    }

    const sessionCode = createSession(state);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const authUrl = `${baseUrl}/cli-login?session=${sessionCode}`;

    authLog.info({ action: 'start', sessionCode: sessionCode.slice(0, 8) + '...', authUrl }, 'Session created successfully');

    return NextResponse.json({ authUrl, sessionCode });
  } catch (err) {
    authLog.error({ action: 'start', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, 'CLI auth start failed');
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
