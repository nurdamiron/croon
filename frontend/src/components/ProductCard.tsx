'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatPrice, getDiscount } from '@/lib/format'
import { addToCart, decrementItem, getItemQuantity, toggleFavorite, isFavorite } from '@/lib/cart'
import { useState, useEffect } from 'react'
import HighlightText from '@/components/HighlightText'

interface ProductCardProps {
  id: string
  name: string
  slug: string
  price: number
  oldPrice: number | null
  images: { url: string; alt: string | null }[]
  inStock: boolean
  priority?: boolean
  highlightQuery?: string
  badgeText?: string | null
}

export default function ProductCard({ id, name, slug, price, oldPrice, images, inStock, priority, highlightQuery, badgeText }: ProductCardProps) {
  const discount = oldPrice ? getDiscount(oldPrice, price) : 0
  const imageUrl = images[0]?.url || '/images/placeholder.svg'
  const imageUrl2 = images[1]?.url
  const [fav, setFav] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hoverLoaded, setHoverLoaded] = useState(false)
  const [qty, setQty] = useState(0)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  useEffect(() => {
    setFav(isFavorite(id))
    setQty(getItemQuantity(id))
    const favHandler = () => setFav(isFavorite(id))
    const cartHandler = () => setQty(getItemQuantity(id))
    window.addEventListener('favorites-updated', favHandler)
    window.addEventListener('cart-updated', cartHandler)
    return () => {
      window.removeEventListener('favorites-updated', favHandler)
      window.removeEventListener('cart-updated', cartHandler)
    }
  }, [id])

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addToCart({ productId: id, name, slug, price, image: imageUrl })
  }

  const handleMinus = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    decrementItem(id)
  }

  const handleToggleFav = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite(id)
  }

  return (
    <div className="group relative flex flex-col h-full">
      {/* Favorite button — min 44px touch target */}
      <button
        onClick={handleToggleFav}
        className="absolute top-0 right-0 z-10 w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        aria-label={fav ? 'Удалить из избранного' : 'В избранное'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={fav ? '#006EBE' : 'none'} stroke={fav ? '#006EBE' : '#9ca3af'} strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>

      {/* Бейджи: скидка (красный) + наклейка badgeText (зелёный, напр. «С НДС»).
          Стек слева-сверху, чтобы не перекрывали друг друга. */}
      {(discount > 0 || badgeText) && (
        <div className="absolute top-1 left-1 z-10 flex flex-col gap-1 items-start">
          {discount > 0 && (
            <span className="bg-[#FF4C4C] text-white text-xs font-semibold px-2 py-0.5 rounded">
              -{discount}%
            </span>
          )}
          {badgeText && (
            <span className="bg-[#16A34A] text-white text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded shadow-sm max-w-[140px] truncate" title={badgeText}>
              {badgeText}
            </span>
          )}
        </div>
      )}

      {/* Image */}
      <Link href={`/product/${slug}`} aria-label={name}>
        <div
          className="relative aspect-square mb-2 overflow-hidden"
          onMouseEnter={() => { if (!isTouchDevice) { setHovered(true); setHoverLoaded(true) } }}
          onMouseLeave={() => { if (!isTouchDevice) setHovered(false) }}
          onTouchStart={() => { if (imageUrl2) setHoverLoaded(true) }}
        >
          <Image
            src={imageUrl}
            alt={name}
            fill
            priority={priority}
            quality={priority ? 75 : 65}
            className={`object-contain transition-opacity duration-300 ${hovered && imageUrl2 ? 'opacity-0' : 'opacity-100'}`}
            sizes="(max-width: 640px) calc(50vw - 16px), (max-width: 1024px) calc(33vw - 16px), 220px"
          />
          {imageUrl2 && hoverLoaded && (
            <Image
              src={imageUrl2}
              alt={name}
              fill
              quality={65}
              className={`object-contain transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-0'}`}
              sizes="(max-width: 640px) calc(50vw - 16px), (max-width: 1024px) calc(33vw - 16px), 220px"
            />
          )}
          {/* Second image indicator — visible on touch devices */}
          {imageUrl2 && isTouchDevice && (
            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1 pointer-events-none">
              <span className={`w-1.5 h-1.5 rounded-full transition-colors ${!hovered ? 'bg-brand' : 'bg-gray-300'}`} />
              <span className={`w-1.5 h-1.5 rounded-full transition-colors ${hovered ? 'bg-brand' : 'bg-gray-300'}`} />
            </div>
          )}
        </div>
      </Link>

      {/* Title */}
      <Link href={`/product/${slug}`} className="block text-[#6B6B6B] hover:text-brand text-[13px] md:text-sm leading-[18px] md:leading-5 line-clamp-3 min-h-[54px] md:min-h-[60px] mb-2 transition-colors flex-1">
        {highlightQuery ? <HighlightText text={name} query={highlightQuery} /> : name}
      </Link>

      {/* Price & Cart */}
      <div className="flex items-center justify-between mt-auto">
        <div>
          {oldPrice && oldPrice > price ? (
            <>
              <span className="text-[10px] md:text-xs text-[#999] line-through block">{formatPrice(oldPrice)}</span>
              <span className="text-[#333] text-sm md:text-base font-medium">{formatPrice(price)}</span>
            </>
          ) : (
            <span className="text-[#333] text-sm md:text-base font-medium">{formatPrice(price)}</span>
          )}
          {inStock ? (
            <span className="text-[10px] text-green-600 flex items-center gap-0.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              В наличии
            </span>
          ) : null}
        </div>

        {!inStock ? (
          <Link
            href={`/product/${slug}`}
            onClick={e => e.stopPropagation()}
            className="text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors px-3 py-1.5 rounded-full"
          >
            Предзаказ
          </Link>
        ) : qty === 0 ? (
          <button
            onClick={handleAddToCart}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-brand hover:bg-brand-hover text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          </button>
        ) : (
          <div className="flex items-center rounded-full overflow-hidden bg-brand text-white text-sm">
            <button
              onClick={handleMinus}
              className="w-10 h-10 flex items-center justify-center hover:bg-brand-hover transition-colors font-bold"
            >
              -
            </button>
            <Link
              href="/cart"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Перейти в корзину (${qty} шт.)`}
              className="px-1 h-10 flex items-center justify-center hover:bg-brand-hover transition-colors min-w-[28px] text-center"
            >
              {qty}
            </Link>
            <button
              onClick={handleAddToCart}
              className="w-10 h-10 flex items-center justify-center hover:bg-brand-hover transition-colors font-bold"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
