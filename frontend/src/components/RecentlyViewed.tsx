'use client'

import { useEffect, useState } from 'react'
import { getViewed } from '@/lib/cart'
import ProductCard from '@/components/ProductCard'

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

export default function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const ids = getViewed().filter(id => id !== excludeId).slice(0, 8)
    if (ids.length === 0) return
    fetch(`/api/products/viewed?ids=${ids.join(',')}`)
      .then(r => r.ok ? r.json() : [])
      .then(setProducts)
      .catch(() => {})
  }, [excludeId])

  if (products.length === 0) return null

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold mb-4">Недавно просмотренные</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {products.map(p => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            slug={p.slug}
            price={p.price}
            oldPrice={p.oldPrice}
            images={p.images}
            inStock={p.inStock}
            badgeText={p.badgeText}
          />
        ))}
      </div>
    </div>
  )
}
