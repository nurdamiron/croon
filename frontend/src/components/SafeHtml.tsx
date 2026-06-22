// SafeHtml component - renders Markdown or HTML content safely
import { sanitizeHtml } from '@/lib/sanitize'
import { marked } from 'marked'

export default function SafeHtml({ html, className }: { html: string; className?: string }) {
  // Detect if content is Markdown (no HTML tags present)
  const isMarkdown = !/<[a-z][\s\S]*>/i.test(html.slice(0, 200))
  const rendered = isMarkdown ? (marked.parse(html) as string) : html
  const sanitizedContent = sanitizeHtml(rendered)
  return (
    <div
      className={className}
      // Safe: content is sanitized before injection
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  )
}
