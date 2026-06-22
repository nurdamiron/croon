import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// We store settings as key-value pairs in a dedicated table
// For now using a simple approach: store in the DB as a special "settings" product variant
// Actually, simplest approach: use prisma.$executeRaw to store in a pg table we create on the fly

// We'll use a simple JSON approach stored in a DB record
// Using the existing DB: store settings as a JSON blob in a dedicated table
// Since we can't easily add a new Prisma model without migration,
// we'll use the existing infrastructure and store as environment-like values

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Try to read from a settings table (created if doesn't exist)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminSettings" (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `)

    const rows = await prisma.$queryRawUnsafe<{ key: string; value: string }[]>(
      `SELECT key, value FROM "AdminSettings"`
    )

    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key] = row.value
    }

    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({})
  }
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminSettings" (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `)

    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AdminSettings" (key, value, "updatedAt") VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = NOW()`,
        key, value
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
