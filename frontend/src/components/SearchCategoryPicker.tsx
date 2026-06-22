'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
  children?: Category[]
}

interface Props {
  categories: Category[]   // плоский список из layout (parentId есть, children — нет)
  value: string             // выбранный slug или '' (все)
  onChange: (slug: string) => void
}

// Селект «искать в категории» — одно-колоночный аккордеон.
// Клик по верхней категории разворачивает её подкатегории прямо под ней.
// Активная (выбранная) категория подсвечена брендовым цветом.
export default function SearchCategoryPicker({ categories, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  // Дерево из плоского списка по parentId. Если единственный root — «Каталог»
  // (slug=all), пропускаем его и показываем сразу его детей как верхний уровень.
  const tree = useMemo(() => {
    const byParent = new Map<string | null, Category[]>()
    for (const c of categories) {
      const arr = byParent.get(c.parentId) ?? []
      arr.push(c)
      byParent.set(c.parentId, arr)
    }
    const build = (parentId: string | null): Category[] =>
      (byParent.get(parentId) ?? []).map(c => ({ ...c, children: build(c.id) }))
    const roots = build(null)
    if (roots.length === 1 && (roots[0].slug === 'all' || roots[0].name.toLowerCase() === 'каталог')) {
      return roots[0].children ?? []
    }
    return roots
  }, [categories])

  // Найти выбранную в дереве (slug может быть и у подкатегории).
  const findBySlug = (items: Category[], slug: string): Category | null => {
    for (const it of items) {
      if (it.slug === slug) return it
      if (it.children?.length) {
        const r = findBySlug(it.children, slug)
        if (r) return r
      }
    }
    return null
  }
  const rootOf = (cat: Category): Category => {
    if (!cat.parentId) return cat
    const p = categories.find(c => c.id === cat.parentId)
    return p ? rootOf(p) : cat
  }

  const selected = value ? findBySlug(tree, value) : null
  const buttonLabel = selected ? selected.name : 'Все категории'

  // При открытии — авто-раскрыть ветку выбранной.
  useEffect(() => {
    if (!open) return
    if (selected) setExpandedId(rootOf(selected).id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Закрытие по клику вне + Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (slug: string) => {
    onChange(slug)
    setOpen(false)
  }

  // Клик по верхней категории: если есть дети — переключаем аккордеон.
  // Если детей нет — это листовая категория, сразу выбираем её.
  const handleTopClick = (cat: Category) => {
    const hasChildren = !!cat.children?.length
    if (!hasChildren) { pick(cat.slug); return }
    setExpandedId(prev => prev === cat.id ? null : cat.id)
  }

  return (
    <div ref={ref} className="relative hidden md:flex border-l border-gray-200">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-full px-3 flex items-center gap-2 text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Искать в категории"
      >
        <span className="truncate max-w-[160px]">{buttonLabel}</span>
        <svg
          width="10" height="10" viewBox="0 0 12 12"
          fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[340px] max-h-[70vh] overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-md z-50">
          <ul className="py-1.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                className={`w-full text-left px-4 py-2.5 transition-colors ${
                  value === '' ? 'text-brand font-semibold' : 'text-gray-700 hover:bg-gray-50 hover:text-brand'
                }`}
              >
                Все категории
              </button>
            </li>
            <li className="border-t border-gray-100" aria-hidden />
            {tree.map(c => {
              const hasChildren = !!c.children?.length
              const expanded = expandedId === c.id
              const picked = value === c.slug
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleTopClick(c)}
                    className={`w-full flex items-center justify-between text-left px-4 py-2.5 transition-colors ${
                      picked ? 'text-brand font-semibold' : 'text-gray-800 hover:bg-gray-50 hover:text-brand'
                    }`}
                  >
                    <span className="truncate">{c.name}</span>
                    {hasChildren && (
                      <svg
                        width="10" height="10" viewBox="0 0 12 12"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        className={`shrink-0 ml-2 transition-transform opacity-50 ${expanded ? 'rotate-180' : ''}`}
                      >
                        <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  {hasChildren && expanded && (
                    <ul className="py-1 bg-gray-50/50">
                      <li>
                        <button
                          type="button"
                          onClick={() => pick(c.slug)}
                          className={`w-full text-left pl-8 pr-4 py-1.5 text-[13px] transition-colors ${
                            picked
                              ? 'text-brand font-semibold'
                              : 'text-gray-500 italic hover:text-brand'
                          }`}
                        >
                          Все товары — {c.name}
                        </button>
                      </li>
                      {c.children!.map(sub => {
                        const subPicked = value === sub.slug
                        return (
                          <li key={sub.id}>
                            <button
                              type="button"
                              onClick={() => pick(sub.slug)}
                              className={`w-full text-left pl-8 pr-4 py-1.5 text-[13px] transition-colors ${
                                subPicked
                                  ? 'text-brand font-semibold'
                                  : 'text-gray-700 hover:text-brand'
                              }`}
                            >
                              {sub.name}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
