'use client'

import { useState } from 'react'
import ProductCard from './ProductCard'

interface Product {
  id: string
  name: string
  slug: string
  price: number
  oldPrice: number | null
  inStock: boolean
  badgeText?: string | null
  images: { url: string; alt: string | null }[]
}

const TABS = [
  { key: 'popular', label: 'Популярные товары' },
  { key: 'new', label: 'Новинки' },
  { key: 'kits', label: 'Готовые наборы Arduino' },
]

export function HomeTabs({
  popularProducts,
  newProducts,
  kitProducts,
}: {
  popularProducts: Product[]
  newProducts: Product[]
  kitProducts?: Product[]
}) {
  const [activeTab, setActiveTab] = useState('popular')

  const products = activeTab === 'popular'
    ? popularProducts
    : activeTab === 'new'
    ? newProducts
    : kitProducts || []

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-baseline gap-2 mb-6 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-lg md:text-[28px] leading-tight pb-1 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'text-[#333] font-bold border-[#333]'
                : 'text-[#999] border-transparent hover:text-[#666] cursor-pointer'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {products.map((product, i) => (
          <ProductCard key={product.id} {...product} priority={activeTab === 'popular' && i < 4} />
        ))}
      </div>
    </div>
  )
}
