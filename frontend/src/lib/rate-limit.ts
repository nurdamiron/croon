import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }
  return store
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  stores.forEach((store) => {
    store.forEach((entry, key) => {
      if (now > entry.resetAt) store.delete(key)
    })
  })
}, 60_000)

interface RateLimitConfig {
  /** Unique name for this limiter */
  name: string
  /** Max requests in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
}

export function rateLimit({ name, limit, windowSeconds }: RateLimitConfig) {
  const store = getStore(name)

  return function check(request: NextRequest): NextResponse | null {
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown'
    const now = Date.now()
    const entry = store.get(ip)

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowSeconds * 1000 })
      return null
    }

    entry.count++

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      return NextResponse.json(
        { error: 'Слишком много запросов. Попробуйте позже.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
          },
        }
      )
    }

    return null
  }
}

// Pre-configured limiters
export const authLimiter = rateLimit({ name: 'auth', limit: 30, windowSeconds: 60 })
export const registerLimiter = rateLimit({ name: 'register', limit: 10, windowSeconds: 60 })
export const orderLimiter = rateLimit({ name: 'order', limit: 15, windowSeconds: 60 })
export const searchLimiter = rateLimit({ name: 'search', limit: 100, windowSeconds: 60 })
export const apiLimiter = rateLimit({ name: 'api', limit: 120, windowSeconds: 60 })

// Separate limiters for password reset — distinct names prevent cross-contamination with authLimiter
export const forgotPasswordLimiter = rateLimit({ name: 'forgot-password', limit: 5, windowSeconds: 900 })
export const resetPasswordLimiter = rateLimit({ name: 'reset-password', limit: 10, windowSeconds: 900 })
