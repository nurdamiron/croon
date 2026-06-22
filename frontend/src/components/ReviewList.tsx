'use client'

import { useEffect, useState } from 'react'

interface Review {
  id: string
  rating: number
  text: string
  createdAt: string
  user: { name: string | null }
}

export default function ReviewList({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reviews?productId=${productId}`)
      .then(r => r.json())
      .then(data => {
        setReviews(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [productId])

  if (loading || reviews.length === 0) return null

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-medium">Отзывы</h3>
        <span className="text-sm text-gray-500">({reviews.length})</span>
        <span className="text-yellow-400 text-sm">{'★'.repeat(Math.round(avg))}</span>
        <span className="text-sm text-gray-500">{avg.toFixed(1)}</span>
      </div>
      <div className="space-y-3">
        {reviews.map(review => (
          <div key={review.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 text-sm">
                  {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                </span>
                <span className="text-sm font-medium">{review.user.name || 'Покупатель'}</span>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(review.createdAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
            <p className="text-sm text-gray-700">{review.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
