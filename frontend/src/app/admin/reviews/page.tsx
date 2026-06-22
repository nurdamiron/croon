'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Review {
  id: string
  rating: number
  text: string
  isApproved: boolean
  createdAt: string
  user: { name: string | null; email: string }
  product: { name: string; slug: string }
}

type Filter = 'pending' | 'approved' | 'all'

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)

  const fetchReviews = async (f: Filter) => {
    setLoading(true)
    const isApprovedParam = f === 'pending' ? 'false' : f === 'approved' ? 'true' : ''
    const url = `/api/admin/reviews${isApprovedParam ? `?isApproved=${isApprovedParam}` : ''}`
    const res = await fetch(url)
    const data = await res.json()
    setReviews(data.reviews || [])
    setLoading(false)
  }

  useEffect(() => { fetchReviews(filter) }, [filter])

  const approve = async (id: string) => {
    await fetch(`/api/admin/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isApproved: true }),
    })
    fetchReviews(filter)
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить отзыв?')) return
    await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' })
    fetchReviews(filter)
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: 'pending', label: 'Ожидают' },
    { key: 'approved', label: 'Одобренные' },
    { key: 'all', label: 'Все' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Отзывы</h1>
      </div>

      <div className="flex gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-admin text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : reviews.length === 0 ? (
        <p className="text-gray-500">Отзывов нет</p>
      ) : (
        <div className="space-y-3">
          {reviews.map(review => (
            <div key={review.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-400 text-sm">
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </span>
                    <span className="text-sm font-medium">{review.user.name || review.user.email}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(review.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                    {!review.isApproved && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        Ожидает
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/product/${review.product.slug}`}
                    target="_blank"
                    className="text-xs text-brand hover:text-brand-hover mb-1 block"
                  >
                    {review.product.name}
                  </Link>
                  <p className="text-sm text-gray-700 line-clamp-3">{review.text}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {!review.isApproved && (
                    <button
                      onClick={() => approve(review.id)}
                      className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Одобрить
                    </button>
                  )}
                  <button
                    onClick={() => remove(review.id)}
                    className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
