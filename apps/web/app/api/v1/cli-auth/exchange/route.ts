import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isUserBlocked } from '@/lib/auth-helpers';
import { consumeSession } from '@/lib/cli-auth-store';
import { authLog } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    authLog.info({ action: 'exchange' }, 'CLI auth exchange request received');

    const body = await request.json();
    const { sessionCode, state } = body;

    if (!sessionCode || typeof sessionCode !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: sessionCode' },
        { status: 400 }
      );
    }

    if (!state || typeof state !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: state' },
        { status: 400 }
      );
    }

    // Consume the session (one-time use, validates state match + authorized status)
    const session = consumeSession(sessionCode, state);
    authLog.info({ action: 'exchange', sessionCode: sessionCode.slice(0, 8) + '...', consumed: !!session, state: state.slice(0, 8) + '...' }, 'Exchange attempt');

    if (!session) {
      authLog.warn({ action: 'exchange', sessionCode: sessionCode.slice(0, 8) + '...' }, 'Session invalid, expired, or already used');
      return NextResponse.json(
        { error: 'Invalid, expired, or already used session code' },
        { status: 400 }
      );
    }

    if (!session.userId) {
      authLog.warn({ action: 'exchange', sessionCode: sessionCode.slice(0, 8) + '...' }, 'Session not properly authorized');
      return NextResponse.json(
        { error: 'Session was not properly authorized' },
        { status: 400 }
      );
    }

    if (await isUserBlocked(session.userId)) {
      return NextResponse.json(
        { error: 'Account is suspended or banned' },
        { status: 403 }
      );
    }

    const apiKeyResult = await auth.api.createApiKey({
      body: {
        name: 'CLI Token',
        userId: session.userId,
        expiresIn: 90 * 24 * 60 * 60,
        rateLimitMax: 1000,
      },
    });

    authLog.info({ action: 'exchange', sessionCode: sessionCode.slice(0, 8) + '...', userId: session.userId, hasKey: !!apiKeyResult?.key }, 'API key creation result');

    if (!apiKeyResult?.key) {
      authLog.error({ action: 'exchange' }, 'Failed to create API key');
      return NextResponse.json(
        { error: 'Failed to create API key' },
        { status: 500 }
      );
    }

    authLog.info({ action: 'exchange', userId: session.userId }, 'Exchange completed successfully - user authenticated via CLI');

    return NextResponse.json({
      token: apiKeyResult.key,
      user: {
        name: session.userName ?? null,
        email: session.userEmail ?? null,
      },
    });
  } catch (err) {
    authLog.error({ action: 'exchange', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, 'CLI auth exchange failed');
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
