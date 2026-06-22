'use client'

import { useRouter } from 'next/navigation'

interface SubChild {
  slug: string
  name: string
  children?: SubChild[]
}

interface Props {
  children: SubChild[]
  parentSlug: string
  selectedSubs: string[]
  sort: string
}

export default function SubcategoryFilter({ children, parentSlug, selectedSubs, sort }: Props) {
  const router = useRouter()

  const buildUrl = (subs: string[]) => {
    const params = new URLSearchParams()
    if (subs.length > 0) params.set('sub', subs.join(','))
    if (sort !== 'default') params.set('sort', sort)
    params.set('page', '1')
    return `/collection/${parentSlug}?${params.toString()}`
  }

  const toggle = (slug: string) => {
    const current = new Set(selectedSubs)
    if (current.has(slug)) {
      current.delete(slug)
    } else {
      current.add(slug)
    }
    router.push(buildUrl(Array.from(current)))
  }

  const clearAll = () => {
    router.push(buildUrl([]))
  }

  // Recursively find selected categories that have children to show
  const collectExpandedChildren = (items: SubChild[]): { parent: string; children: SubChild[] }[] => {
    const result: { parent: string; children: SubChild[] }[] = []
    for (const item of items) {
      if (selectedSubs.includes(item.slug) && item.children && item.children.length > 0) {
        result.push({ parent: item.name, children: item.children })
        // Also check deeper
        result.push(...collectExpandedChildren(item.children))
      }
    }
    return result
  }

  const expandedRows = collectExpandedChildren(children)

  return (
    <div className="mb-6 space-y-2">
      {/* Top-level subcategories — horizontal scroll on mobile, wrap on desktop */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0 scrollbar-hide">
          {children.map(child => (
            <button
              key={child.slug}
              onClick={() => toggle(child.slug)}
              className={`px-3 py-2 rounded-full text-sm transition-colors shrink-0 min-h-[40px] ${
                selectedSubs.includes(child.slug)
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 hover:bg-brand/10 hover:text-brand'
              }`}
            >
              {child.name}
            </button>
          ))}
          {selectedSubs.length > 0 && (
            <button
              onClick={clearAll}
              className="px-3 py-2 rounded-full text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 min-h-[40px]"
            >
              Сбросить
            </button>
          )}
        </div>
        {/* Fade hint — only on mobile when items overflow */}
        <div className="md:hidden absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      </div>

      {/* Expanded sub-rows (any depth) */}
      {expandedRows.map(row => (
        <div key={row.parent} className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0 scrollbar-hide items-center pl-1">
            <span className="text-xs text-gray-400 shrink-0">{row.parent}:</span>
            {row.children.map(gc => (
              <button
                key={gc.slug}
                onClick={() => toggle(gc.slug)}
                className={`px-2.5 py-1.5 rounded-full text-xs transition-colors shrink-0 ${
                  selectedSubs.includes(gc.slug)
                    ? 'bg-brand/80 text-white'
                    : 'bg-gray-50 border border-gray-200 hover:bg-brand/10 hover:text-brand'
                }`}
              >
                {gc.name}
              </button>
            ))}
          </div>
          <div className="md:hidden absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />
        </div>
      ))}
    </div>
  )
}
