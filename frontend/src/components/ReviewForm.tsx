'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function ReviewForm({ productId }: { productId: string }) {
  const { data: session } = useSession()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  if (!session) {
    return (
      <div className="border rounded-lg p-4 text-sm text-gray-500">
        <Link href="/client_account/login" className="text-brand hover:text-brand-hover">Войдите</Link>
        {' '}чтобы оставить отзыв
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="border rounded-lg p-4 text-sm text-green-600 bg-green-50">
        Отзыв отправлен на модерацию. Спасибо!
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (rating === 0) { setError('Выберите оценку'); return }
    if (text.length < 10) { setError('Отзыв должен быть не менее 10 символов'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, text }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Ошибка отправки')
      }
    } catch {
      setError('Ошибка сети')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
      <h3 className="font-medium text-sm">Оставить отзыв</h3>

      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="text-2xl leading-none transition-colors"
          >
            <span className={(hovered || rating) >= star ? 'text-yellow-400' : 'text-gray-300'}>★</span>
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Ваш отзыв (минимум 10 символов)"
        maxLength={2000}
        rows={3}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand resize-none"
      />

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-brand text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
      >
        {loading ? 'Отправка...' : 'Отправить отзыв'}
      </button>
    </form>
  )
}
