import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Доступ: админ-сессия ИЛИ ?secret=<CRON_SECRET> (для одноразового запуска без UI).
async function authorized(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  if (session?.user && (session.user as any).role === 'ADMIN') return true
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = req.nextUrl.searchParams.get('secret')
    if (auth === `Bearer ${secret}` || qs === secret) return true
  }
  return false
}

// Чинит битый markdown в описаниях товаров: артефакт вида "1****0 см" → "10 см"
// (лишние ** между цифрами, оставшиеся от двойного жирного **1****0 см**).
// GET  — показать что будет исправлено (dry-run).
// POST — применить.
// Без флага g — чтобы .test()/.match() не зависели от lastIndex между вызовами.
const RE = /(\d)\*{2,}(\d)/
const RE_G = /(\d)\*{2,}(\d)/g

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const products = await prisma.product.findMany({
    where: { description: { contains: '****' } },
    select: { id: true, name: true, description: true },
  })
  const affected = products
    .filter(p => p.description && RE.test(p.description))
    .map(p => ({ id: p.id, name: p.name, fixes: p.description!.match(RE_G) || [] }))
  return NextResponse.json({ count: affected.length, affected })
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const products = await prisma.product.findMany({
    where: { description: { contains: '****' } },
    select: { id: true, name: true, description: true },
  })
  const results: Array<{ id: string; name: string; before: string[]; after: string[] }> = []
  for (const p of products) {
    if (!p.description || !RE.test(p.description)) continue
    const before = p.description.match(RE_G) || []
    const fixed = p.description.replace(RE_G, '$1$2')
    if (fixed === p.description) continue
    await prisma.product.update({ where: { id: p.id }, data: { description: fixed } })
    results.push({ id: p.id, name: p.name, before, after: fixed.match(RE_G) || [] })
  }
  return NextResponse.json({ fixed: results.length, results })
}
