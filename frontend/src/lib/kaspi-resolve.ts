// Server-only: безопасная размотка коротких ссылок Kaspi (l.kaspi.kz/shop/HASH).
// Короткая ссылка отдаёт хеш вместо цифрового product-id, поэтому её нельзя
// распарсить regex'ом — нужно проследить HTTP-редирект до финального
// kaspi.kz/shop/p/...-PID/ и взять product-id оттуда (extractKaspiPid).
//
// БЕЗОПАСНОСТЬ (SSRF): вход — строка от админа, по ней делается fetch. Поэтому:
//  - валидируем через new URL() (НЕ substring), хост строго из allow-листа Kaspi;
//  - резолвим DNS и блокируем приватные/loopback/link-local IP (метаданные AWS и т.п.);
//  - редиректы следуем ВРУЧНУЮ (redirect:'manual') и каждый Location проверяем заново.
//
// GET (HEAD на Kaspi даёт 405). Браузерный UA, таймаут 8с. При любой ошибке —
// возвращаем исходный input (graceful, дальше отработают синхронные ветки).

import { lookup } from 'node:dns/promises'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Разрешённые хосты: короткая ссылка и её цель (карточка Kaspi).
const ALLOWED_HOSTS = new Set(['l.kaspi.kz', 'kaspi.kz', 'www.kaspi.kz'])
const MAX_HOPS = 5

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(v) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
    v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
  )
}

// Проверить, что URL допустим: схема http(s), хост в allow-листе, резолвится в
// не-приватный IP. Кидает при нарушении.
async function assertSafe(u: URL): Promise<void> {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad scheme')
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!ALLOWED_HOSTS.has(host)) throw new Error('host not allowed: ' + host)
  const { address } = await lookup(host)
  if (isPrivateIp(address)) throw new Error('private ip')
}

export async function resolveKaspiUrl(input: string): Promise<string> {
  const raw = String(input || '').trim()
  if (!raw) return raw
  try {
    let current = new URL(raw)
    await assertSafe(current)

    // Следуем редиректам вручную, проверяя каждый хоп.
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const res = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ru,en;q=0.9' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      })
      // редирект?
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) break
        const next = new URL(loc, current) // относительный Location → абсолютный
        await assertSafe(next)             // КАЖДЫЙ хоп заново валидируем
        current = next
        continue
      }
      // не редирект — это финальный URL
      return current.toString()
    }
    return current.toString()
  } catch {
    return raw // не размотали безопасно — отдаём как есть
  }
}
