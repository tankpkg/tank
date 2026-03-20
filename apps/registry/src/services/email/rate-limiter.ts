import { getKVStore } from '~/services/kv';

const EMAIL_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const EMAIL_RATE_LIMIT_MAX = 3;
const VERIFICATION_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const VERIFICATION_RATE_LIMIT_MAX = 5;

export async function checkEmailRateLimit(
  email: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const kv = getKVStore();
  const key = `email:rate:${email.toLowerCase()}`;
  const current = await kv.incr(key, EMAIL_RATE_LIMIT_WINDOW);
  return {
    allowed: current <= EMAIL_RATE_LIMIT_MAX,
    remaining: Math.max(0, EMAIL_RATE_LIMIT_MAX - current),
    resetIn: EMAIL_RATE_LIMIT_WINDOW
  };
}

export async function checkVerificationRateLimit(
  email: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const kv = getKVStore();
  const key = `email:verification:${email.toLowerCase()}`;
  const current = await kv.incr(key, VERIFICATION_RATE_LIMIT_WINDOW);
  return {
    allowed: current <= VERIFICATION_RATE_LIMIT_MAX,
    remaining: Math.max(0, VERIFICATION_RATE_LIMIT_MAX - current),
    resetIn: VERIFICATION_RATE_LIMIT_WINDOW
  };
}
