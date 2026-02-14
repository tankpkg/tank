import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { consumeSession } from '@/lib/cli-auth-store';

export async function POST(request: Request) {
  try {
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
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid, expired, or already used session code' },
        { status: 400 }
      );
    }

    if (!session.userId) {
      return NextResponse.json(
        { error: 'Session was not properly authorized' },
        { status: 400 }
      );
    }

    // Create an API key for the user
    const apiKeyResult = await auth.api.createApiKey({
      body: {
        name: 'CLI Token',
        userId: session.userId,
      },
    });

    if (!apiKeyResult?.key) {
      return NextResponse.json(
        { error: 'Failed to create API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      token: apiKeyResult.key,
      user: {
        name: session.userName ?? null,
        email: session.userEmail ?? null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
