// Построение Kaspi product-id (PID) и прямой ссылки на карточку из SKU.
// Длинный SKU вида "цифры_цифры" → первая часть = реальный Kaspi product-id,
// по которому строится рабочая ссылка kaspi.kz/shop/p/-<PID>/?c=...
// Короткий артикул / большое отдельное число (PID==SKU) — НЕ Kaspi-id, ссылку
// по нему строить нельзя (проверено: → 404).

const CITY = '750000000'

// Вернуть Kaspi PID из SKU, если он валиден (есть "_"), иначе null.
export function kaspiPidFromSku(sku: string): string | null {
  const s = String(sku || '')
  if (/^\d+_\d+$/.test(s)) return s.split('_')[0]
  return null
}

// Прямая ссылка на карточку Kaspi по PID.
export function kaspiUrlFromPid(pid: string): string {
  return `https://kaspi.kz/shop/p/-${pid}/?c=${CITY}`
}

// Удобный комбайн: SKU → { pid, url } или null если нельзя построить.
export function kaspiLinkFromSku(sku: string): { pid: string; url: string } | null {
  const pid = kaspiPidFromSku(sku)
  if (!pid) return null
  return { pid, url: kaspiUrlFromPid(pid) }
}

// Извлечь Kaspi product-id из ЛЮБОГО строкового ввода (синхронно, без сети):
//  - полная ссылка kaspi.kz/shop/p/...-138327669/  → 138327669
//  - составной SKU "PID_xxx"                        → PID
//  - голый product-id (6+ цифр)                     → как есть
// НЕ понимает короткие ссылки l.kaspi.kz/shop/HASH (там хеш) — их сначала
// размотать через resolveKaspiUrl (lib/kaspi-resolve.ts), потом сюда финальный URL.
export function extractKaspiPid(input: string): string | null {
  const s = String(input || '').trim()
  if (!s) return null
  // URL-форма: "-<цифры>" перед / ? # или концом строки
  const m = s.match(/-(\d{6,})(?:[/?#]|$)/)
  if (m) return m[1]
  // составной SKU "цифры_цифры"
  if (/^\d+_\d+$/.test(s)) return s.split('_')[0]
  // голый product-id (6+ цифр, чтобы не путать с внутренними артикулами вроде "246")
  if (/^\d{6,}$/.test(s)) return s
  return null
}

// Это короткая ссылка-редирект Kaspi (l.kaspi.kz/...)? Парсим через URL (НЕ substring),
// чтобы не путать с l.kaspi.kz.evil.com или ?x=l.kaspi.kz. Хост должен быть РОВНО l.kaspi.kz.
export function isShortKaspiLink(input: string): boolean {
  const s = String(input || '').trim()
  try {
    const u = new URL(s)
    return u.hostname.toLowerCase().replace(/\.$/, '') === 'l.kaspi.kz'
  } catch {
    return false
  }
}
