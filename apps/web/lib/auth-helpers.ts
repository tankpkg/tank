import { auth } from './auth';

export interface VerifiedApiKey {
  userId: string;
  keyId: string;
}

/**
 * Verify a CLI request's API key from the Authorization header.
 * Expects: `Authorization: Bearer tank_...`
 * Returns verified key info or null if invalid/missing.
 */
export async function verifyCliAuth(request: Request): Promise<VerifiedApiKey | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }

  try {
    const result = await auth.api.verifyApiKey({ body: { key: token } });

    if (!result.valid || !result.key) {
      return null;
    }

    return {
      userId: result.key.userId,
      keyId: result.key.id,
    };
  } catch {
    return null;
  }
}
