const EMAIL_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const EMAIL_RATE_LIMIT_MAX = 3; // Max 3 emails per minute per address
const VERIFICATION_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const VERIFICATION_RATE_LIMIT_MAX = 5; // Max 5 verification emails per hour per address

const counters = new Map<string, { count: number; expires: number }>();

function getCounter(key: string, windowMs: number): number {
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || now >= entry.expires) {
    counters.set(key, { count: 1, expires: now + windowMs });
    return 1;
  }
  entry.count++;
  return entry.count;
}

function getTtl(key: string): number {
  const entry = counters.get(key);
  if (!entry) return 0;
  const remaining = entry.expires - Date.now();
  return remaining > 0 ? remaining : 0;
}

export async function checkEmailRateLimit(
  email: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `email:rate:${email.toLowerCase()}`;
  const current = getCounter(key, EMAIL_RATE_LIMIT_WINDOW);
  return {
    allowed: current <= EMAIL_RATE_LIMIT_MAX,
    remaining: Math.max(0, EMAIL_RATE_LIMIT_MAX - current),
    resetIn: getTtl(key)
  };
}

export async function checkVerificationRateLimit(
  email: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `email:verification:${email.toLowerCase()}`;
  const current = getCounter(key, VERIFICATION_RATE_LIMIT_WINDOW);
  return {
    allowed: current <= VERIFICATION_RATE_LIMIT_MAX,
    remaining: Math.max(0, VERIFICATION_RATE_LIMIT_MAX - current),
    resetIn: getTtl(key)
  };
}
