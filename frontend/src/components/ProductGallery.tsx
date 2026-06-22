'use client'

import Image from 'next/image'
import { useState, useRef, useCallback, useEffect } from 'react'

interface GalleryProps {
  images: { url: string; alt: string }[]
}

export function ProductGallery({ images }: GalleryProps) {
  const [selected, setSelected] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  const goNext = useCallback(() => {
    setSelected(i => (i + 1) % images.length)
  }, [images.length])

  const goPrev = useCallback(() => {
    setSelected(i => (i - 1 + images.length) % images.length)
  }, [images.length])

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [lightbox, goNext, goPrev])

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
        Нет изображения
      </div>
    )
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    // Only swipe if horizontal movement > vertical and > 50px
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  return (
    <>
      <div className="flex flex-col-reverse md:flex-row gap-3">
        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="flex md:flex-col gap-2 shrink-0 overflow-x-auto md:overflow-x-visible">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setSelected(idx)}
                className={`relative w-[60px] h-[60px] md:w-[70px] md:h-[70px] rounded border-2 overflow-hidden transition-colors shrink-0 ${
                  idx === selected ? 'border-brand' : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  className="object-contain p-1"
                  sizes="70px"
                />
              </button>
            ))}
          </div>
        )}

        {/* Main image */}
        <div
          ref={mainRef}
          className="relative flex-1 aspect-square bg-white border border-gray-200 rounded-lg overflow-hidden cursor-zoom-in"
          onClick={() => setLightbox(true)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <Image
            src={images[selected].url}
            alt={images[selected].alt}
            fill
            className="object-contain p-4"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 45vw, 500px"
            quality={85}
            priority
          />
          {/* Swipe arrows on mobile */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, idx) => (
                <span
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx === selected ? 'bg-brand' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          {/* Close button */}
          <button
            className="absolute top-3 right-3 text-white/70 hover:text-white z-10 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setLightbox(false)}
            aria-label="Закрыть"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Prev arrow */}
          {images.length > 1 && (
            <button
              className="absolute left-2 md:left-6 text-white/70 hover:text-white z-10 p-3"
              onClick={e => { e.stopPropagation(); goPrev() }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}

          {/* Main lightbox image */}
          <div
            className="relative w-[90vw] h-[80vh] max-w-[1000px]"
            onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Image
              src={images[selected].url}
              alt={images[selected].alt}
              fill
              className="object-contain"
              sizes="90vw"
              quality={90}
            />
          </div>

          {/* Next arrow */}
          {images.length > 1 && (
            <button
              className="absolute right-2 md:right-6 text-white/70 hover:text-white z-10 p-3"
              onClick={e => { e.stopPropagation(); goNext() }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}

          {/* Dots */}
          {images.length > 1 && (
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={e => { e.stopPropagation(); setSelected(idx) }}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    idx === selected ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
