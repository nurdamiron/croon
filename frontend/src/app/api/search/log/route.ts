import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { searchLimiter } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const blocked = searchLimiter(request)
  if (blocked) return blocked

  try {
    const { query, resultsCount, sessionId } = await request.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }
    await prisma.searchLog.create({
      data: {
        query: query.slice(0, 200),
        resultsCount: resultsCount ?? 0,
        sessionId: sessionId || null,
      },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
