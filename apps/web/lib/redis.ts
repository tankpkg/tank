import Redis from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis | null {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }
  return redis
}

export { redis }
