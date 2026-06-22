'use client'

interface Props {
  text: string
  query: string
  className?: string
}

export default function HighlightText({ text, query, className }: Props) {
  if (!query?.trim()) return <span className={className}>{text}</span>

  const words = query.trim().split(/[\s\-_]+/).filter(w => w.length >= 2)
  if (words.length === 0) return <span className={className}>{text}</span>

  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-100 text-inherit rounded-[2px] px-[1px] not-italic">
            {part}
          </mark>
        ) : (
          part || null
        )
      )}
    </span>
  )
}
