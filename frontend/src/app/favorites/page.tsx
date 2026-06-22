'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getFavorites, toggleFavorite } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import { addToCart } from '@/lib/cart'

interface FavProduct {
  id: string
  name: string
  slug: string
  price: number
  oldPrice: number | null
  inStock: boolean
  images: { url: string; alt: string | null }[]
}

export default function FavoritesPage() {
  const [products, setProducts] = useState<FavProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const loadFavorites = async () => {
    const ids = getFavorites()
    if (ids.length === 0) {
      setProducts([])
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/products?ids=${ids.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      }
    } catch (e) {
      console.error('Failed to load favorites:', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadFavorites()
    window.addEventListener('favorites-updated', loadFavorites)
    return () => window.removeEventListener('favorites-updated', loadFavorites)
  }, [])

  const handleRemove = (productId: string) => {
    toggleFavorite(productId)
    setProducts(prev => prev.filter(p => p.id !== productId))
  }

  const handleAddToCart = (product: FavProduct) => {
    addToCart({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      image: product.images[0]?.url || '',
    })
    setAddedIds(prev => new Set(prev).add(product.id))
    setTimeout(() => {
      setAddedIds(prev => { const s = new Set(prev); s.delete(product.id); return s })
    }, 2000)
  }

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-12 text-center">
        <p className="text-gray-500">Загрузка...</p>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Избранное пусто</h1>
        <p className="text-gray-500 mb-6">Добавьте товары в избранное, нажав на сердечко</p>
        <Link href="/" className="bg-brand text-white px-6 py-3 rounded-lg hover:bg-brand-hover transition-colors">
          Перейти в каталог
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand">Главная</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-800">Избранное</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6">Избранное ({products.length})</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map(product => {
          const image = product.images[0]?.url || ''
          const discount = product.oldPrice
            ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
            : 0

          return (
            <div key={product.id} className="border rounded-lg p-3 group relative">
              <button
                onClick={() => handleRemove(product.id)}
                className="absolute top-2 right-2 z-10 p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="Удалить из избранного"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>

              {discount > 0 && (
                <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded z-10">
                  -{discount}%
                </span>
              )}

              <Link href={`/product/${product.slug}`}>
                <div className="relative aspect-square mb-3">
                  {image ? (
                    <Image src={image} alt={product.name} fill className="object-contain p-2" sizes="(max-width: 768px) 50vw, 25vw" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                      Нет фото
                    </div>
                  )}
                </div>
                <h3 className="text-sm text-gray-800 line-clamp-3 mb-2 group-hover:text-brand transition-colors">
                  {product.name}
                </h3>
              </Link>

              <div className="mt-auto">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-bold text-lg">{formatPrice(product.price)}</span>
                  {product.oldPrice && (
                    <span className="text-sm text-gray-400 line-through">{formatPrice(product.oldPrice)}</span>
                  )}
                </div>
                <button
                  onClick={() => handleAddToCart(product)}
                  disabled={!product.inStock}
                  className={`w-full py-3 rounded-lg text-sm font-medium transition-all ${
                    !product.inStock
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : addedIds.has(product.id)
                      ? 'bg-green-500 text-white'
                      : 'bg-brand text-white hover:bg-brand-hover'
                  }`}
                >
                  {!product.inStock ? 'Нет в наличии' : addedIds.has(product.id) ? '✓ Добавлено' : 'В корзину'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
