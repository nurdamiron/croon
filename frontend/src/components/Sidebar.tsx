'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
}

export default function Sidebar({ categories, currentSlug }: { categories: Category[]; currentSlug?: string }) {
  const rootId = categories.find(c => c.name === 'Каталог')?.id
  const topLevel = categories.filter(c => c.parentId === rootId)
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId)

  return (
    <aside className="hidden lg:block w-[280px] shrink-0">
      <h2 className="font-semibold text-lg mb-3">Каталог</h2>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Электронные компоненты с доставкой по Казахстану. Самовывоз: Алматы, ул. Кыз Жибек, 104/1. Пн–сб 12:00–20:00.
      </p>
      <ul>
        {topLevel.map(cat => (
          <SidebarItem
            key={cat.id}
            cat={cat}
            categories={categories}
            currentSlug={currentSlug}
            getChildren={getChildren}
          />
        ))}
      </ul>
    </aside>
  )
}

function SidebarItem({
  cat,
  categories,
  currentSlug,
  getChildren,
}: {
  cat: Category
  categories: Category[]
  currentSlug?: string
  getChildren: (id: string) => Category[]
}) {
  const children = getChildren(cat.id)
  const isActive = cat.slug === currentSlug
  const hasActiveChild = children.some(c => c.slug === currentSlug)
  const [expanded, setExpanded] = useState(hasActiveChild)

  return (
    <li>
      <div className="flex items-center border-b border-gray-100">
        <Link
          href={`/collection/${cat.slug}`}
          className={`flex-1 py-[10px] text-sm transition-colors ${
            isActive ? 'text-brand font-medium' : 'text-[#333] hover:text-brand'
          }`}
        >
          {cat.name}
        </Link>
        {children.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-400 hover:text-brand"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={expanded ? 'M2 8l4-4 4 4' : 'M4 2l4 4-4 4'} />
            </svg>
          </button>
        )}
      </div>
      {expanded && children.length > 0 && (
        <ul className="pl-4 pb-1">
          {children.map(child => (
            <li key={child.id}>
              <Link
                href={`/collection/${child.slug}`}
                className={`block py-1.5 text-sm transition-colors ${
                  child.slug === currentSlug ? 'text-brand font-medium' : 'text-[#6B6B6B] hover:text-brand'
                }`}
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
