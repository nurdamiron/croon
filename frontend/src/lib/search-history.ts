'use client'

// История поиска в localStorage — последние запросы пользователя.
// Хранятся на устройстве, без сервера. Дубли убираются без учёта регистра.
const KEY = 'croon_search_history'
const MAX = 8

export function readSearchHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function addSearchHistory(query: string) {
  if (typeof window === 'undefined') return
  const q = query.trim()
  if (q.length < 2) return
  try {
    const list = readSearchHistory().filter((s) => s.toLowerCase() !== q.toLowerCase())
    list.unshift(q)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* localStorage недоступен */
  }
}

export function removeSearchHistory(query: string) {
  if (typeof window === 'undefined') return
  try {
    const list = readSearchHistory().filter((s) => s !== query)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* noop */
  }
}

export function clearSearchHistory() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}
