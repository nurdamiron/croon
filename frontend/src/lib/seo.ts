export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alash-electronics.kz'

export function stripMarkdown(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')           // HTML tags
    .replace(/!\[.*?\]\(.*?\)/g, '')   // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links -> text
    .replace(/#{1,6}\s?/g, '')         // headings
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2') // bold/italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
    .replace(/>\s?/g, '')              // blockquotes
    .replace(/[-*+]\s/g, '')           // list markers
    .replace(/\d+\.\s/g, '')           // ordered list markers
    .replace(/\n{2,}/g, ' ')           // multiple newlines
    .replace(/\n/g, ' ')              // single newlines
    .replace(/\s{2,}/g, ' ')          // multiple spaces
    .trim()
}

export function truncate(text: string, len: number = 160): string {
  if (text.length <= len) return text
  const truncated = text.slice(0, len)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > len * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

export function cleanDescription(text: string | null | undefined, len: number = 160): string {
  if (!text) return ''
  return truncate(stripMarkdown(text), len)
}

/**
 * Shorten a product name to fit within the SEO title limit.
 * Tries natural break points: comma → bracket → last word space → hard cut.
 * Returns null if name is already short enough (≤ max).
 *
 * Examples:
 *   "Радиоприемник FLYSKY FS-i6, i6, 2,4 ГГц, 6 каналов..."  → "Радиоприемник FLYSKY FS-i6"
 *   "Модуль реле 5В 4-канальный (клон) для Arduino"           → "Модуль реле 5В 4-канальный"
 *   "Датчик температуры и влажности DHT22 AM2302 с кабелем"  → "Датчик температуры и влажности DHT22…"
 */
export function smartTitle(name: string, max: number = 41): string | null {
  if (name.length <= max) return null

  // 1. Split at first comma — "Product name, spec, spec2" → "Product name"
  const commaIdx = name.indexOf(',')
  if (commaIdx > 20 && commaIdx <= max - 1) {
    return name.slice(0, commaIdx).trim()
  }

  // 2. Split at first bracket — "Product name (clone) details" → "Product name"
  const bracketIdx = name.search(/[([{]/)
  if (bracketIdx > 20 && bracketIdx <= max - 1) {
    return name.slice(0, bracketIdx).trim()
  }

  // 3. Truncate at last word boundary before max
  const sub = name.slice(0, max - 1)
  const lastSpace = sub.lastIndexOf(' ')
  if (lastSpace > 20) {
    return sub.slice(0, lastSpace).trim() + '…'
  }

  // 4. Hard cut
  return sub.trim() + '…'
}
