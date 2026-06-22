const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'img',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'div', 'span', 'blockquote', 'pre', 'code', 'hr',
  'figure', 'figcaption', 'del', 'ins', 'sub', 'sup',
])

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'target', 'rel', 'width', 'height', 'colspan', 'rowspan', 'aria-label',
])

export function sanitizeHtml(html: string): string {
  // Remove script/style tags and their content
  let clean = html.replace(/<(script|style|iframe|object|embed|form|input|textarea|select|button)\b[^]*?<\/\1>/gi, '')
  // Remove lone script/style opening tags
  clean = clean.replace(/<(script|style|iframe|object|embed|form|input|textarea|select|button)\b[^>]*\/?>/gi, '')
  // Remove event handlers (onclick, onerror, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
  // Remove javascript: URLs entirely
  clean = clean.replace(/\bhref\s*=\s*(?:"[^"]*javascript:[^"]*"|'[^']*javascript:[^']*'|\S*javascript:\S*)/gi, '')
  // Upgrade HTTP image sources to HTTPS (mixed content fix)
  clean = clean.replace(/(<img\b[^>]*\bsrc=")http:\/\//gi, '$1https://')
  // Demote h1→h2, h2→h3, h3→h4 so sanitized content never competes with the page's h1
  clean = clean.replace(/<(\/?)h([123])\b([^>]*)>/gi, (_, slash, level, attrs) => {
    const newLevel = Math.min(parseInt(level) + 1, 4)
    return `<${slash}h${newLevel}${attrs}>`
  })
  // Strip disallowed tags but keep content
  clean = clean.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi, (match, tag) => {
    const t = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(t)) return ''
    // For closing tags, just return the close tag
    if (match.startsWith('</')) return `</${t}>`
    // For opening/self-closing tags, filter attributes
    const attrRegex = /\s([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi
    const attrs: RegExpExecArray[] = []
    let m: RegExpExecArray | null
    while ((m = attrRegex.exec(match)) !== null) attrs.push(m)
    const filtered = attrs
      .filter(m => ALLOWED_ATTRS.has(m[1].toLowerCase()))
      .map(m => ` ${m[1].toLowerCase()}="${(m[2] ?? m[3] ?? m[4] ?? '').replace(/"/g, '&quot;')}"`)
      .join('')
    const selfClose = match.endsWith('/>') ? ' /' : ''
    // Ensure img tags always have an alt attribute
    if (t === 'img' && !filtered.includes(' alt=')) {
      return `<${t}${filtered} alt=""${selfClose}>`
    }
    // External links: open in new tab; same-domain links get noopener only; truly external get nofollow too
    if (t === 'a') {
      const hrefMatch = filtered.match(/ href="([^"]*)"/)
      const href = hrefMatch?.[1] ?? ''
      if (href.startsWith('http')) {
        const base = filtered.replace(/ (target|rel|download)="[^"]*"/g, '')
        const isSameDomain = /^https?:\/\/(?:shop\.alashed\.kz|alash-electronics\.kz|alashed\.kz)\b/i.test(href)
        const isFile = /\.(pdf|zip|rar|doc|docx|xls|xlsx|csv|dwg|dxf|stl|hex|bin|ino|py)(\?[^"]*)?$/i.test(href)
        if (isSameDomain) {
          // Internal absolute URL — no nofollow, just safe open
          if (isFile) {
            return `<a${base} target="_blank" rel="noopener noreferrer" download>`
          }
          return `<a${base} target="_blank" rel="noopener noreferrer">`
        }
        // External links: noopener noreferrer only — nofollow removed per SEO audit
        if (isFile) {
          return `<a${base} target="_blank" rel="noopener noreferrer" download>`
        }
        return `<a${base} target="_blank" rel="noopener noreferrer">`
      }
    }
    return `<${t}${filtered}${selfClose}>`
  })
  // Unwrap image-only anchors where href points to an image URL → keep just the <img>
  clean = clean.replace(/<a\b[^>]*href="[^"]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^"]*)?"\s[^>]*>(<img\b[^>]*\/?>)<\/a>/gi, '$3')
  // Add aria-label to anchors with no visible text (image-only or empty links)
  clean = clean.replace(/<a\b([^>]*)>((?:<img\b[^>]*\/?>|\s)*)<\/a>/gi, (match, attrs, inner) => {
    if (/aria-label=/i.test(attrs)) return match
    // Extract href for a more descriptive label
    const hrefMatch = attrs.match(/href="([^"]*)"/)
    const label = hrefMatch?.[1]
      ? hrefMatch[1].split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Ссылка'
      : 'Ссылка'
    return `<a${attrs} aria-label="${label}">${inner}</a>`
  })
  // Handle truly empty anchors <a href="..."></a> — add descriptive aria-label
  clean = clean.replace(/<a\b([^>]*)>\s*<\/a>/gi, (match, attrs) => {
    if (/aria-label=/i.test(attrs)) return match
    const hrefMatch = attrs.match(/href="([^"]*)"/)
    const label = hrefMatch?.[1]
      ? hrefMatch[1].split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Ссылка'
      : 'Ссылка'
    return `<a${attrs} aria-label="${label}"></a>`
  })

  return clean
}
