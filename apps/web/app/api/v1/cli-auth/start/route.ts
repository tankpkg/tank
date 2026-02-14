import { NextResponse } from 'next/server';
import { createSession } from '@/lib/cli-auth-store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { state } = body;

    if (!state || typeof state !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: state' },
        { status: 400 }
      );
    }

    const sessionCode = createSession(state);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const authUrl = `${baseUrl}/cli-login?session=${sessionCode}`;

    return NextResponse.json({ authUrl, sessionCode });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
