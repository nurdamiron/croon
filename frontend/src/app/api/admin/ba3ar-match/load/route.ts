import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// POST /api/admin/ba3ar-match/load — загрузить match-result.json (лежит в корне
// проекта на сервере) в таблицу Ba3arMatch. Перезаписывает только pending-записи
// (не трогает уже confirmed/rejected, чтобы не потерять ручную работу).
export async function POST() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const path = process.cwd() + '/match-result.json'
  if (!fs.existsSync(path)) {
    return NextResponse.json({ error: 'match-result.json не найден на сервере' }, { status: 404 })
  }
  const data = JSON.parse(fs.readFileSync(path, 'utf8'))
  const matched = data.matched || []
  const onlyBa3ar = data.onlyBa3ar || []
  const onlyAlash = data.onlyAlash || []

  // сохраним уже принятые решения
  const decided = await prisma.ba3arMatch.findMany({
    where: { status: { in: ['confirmed', 'rejected'] } },
    select: { ba3arSku: true, alashId: true, status: true, kind: true },
  })
  const decidedKey = new Map<string, string>()
  for (const d of decided) decidedKey.set(`${d.kind}|${d.ba3arSku ?? ''}|${d.alashId ?? ''}`, d.status)

  // очистим pending, перельём заново
  await prisma.ba3arMatch.deleteMany({ where: { status: 'pending' } })

  const rows: any[] = []
  for (const m of matched) {
    const key = `matched|${m.ba3ar_sku}|${m.alash_id}`
    if (decidedKey.has(key)) continue // уже решено — пропускаем
    rows.push({ kind: 'matched', ba3arSku: String(m.ba3ar_sku), ba3arTitle: m.ba3ar_title, alashId: String(m.alash_id), alashName: m.alash_name, score: m.score })
  }
  for (const b of onlyBa3ar) {
    rows.push({ kind: 'only_ba3ar', ba3arSku: String(b.ba3ar_sku), ba3arTitle: b.ba3ar_title, alashName: b.best_guess || null, score: b.score ?? null })
  }
  for (const a of onlyAlash) {
    rows.push({ kind: 'only_alash', alashId: String(a.alash_id), alashName: a.alash_name })
  }

  // батчами
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.ba3arMatch.createMany({ data: rows.slice(i, i + 500) })
  }

  const counts = await prisma.ba3arMatch.groupBy({ by: ['kind', 'status'], _count: { _all: true } })
  return NextResponse.json({ ok: true, loaded: rows.length, counts })
}
