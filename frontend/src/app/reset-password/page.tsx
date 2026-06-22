'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <p className="text-red-500">Ссылка недействительна.</p>
        <Link href="/forgot-password" className="text-brand hover:text-brand-hover text-sm">
          Запросить новую ссылку
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => router.push('/client_account/login'), 2000)
      } else {
        setError(data.error || 'Ошибка. Попробуйте ещё раз.')
      }
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="border rounded-lg p-6 text-center space-y-3">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <p className="font-medium">Пароль успешно изменён!</p>
        <p className="text-sm text-gray-500">Перенаправляем на страницу входа...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль *</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
          placeholder="Минимум 8 символов"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Повторите пароль *</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
          placeholder="Повторите новый пароль"
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand text-white py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:bg-gray-400"
      >
        {loading ? 'Сохранение...' : 'Сохранить новый пароль'}
      </button>
      <div className="text-center">
        <Link href="/forgot-password" className="text-sm text-gray-500 hover:text-brand">
          Запросить новую ссылку
        </Link>
      </div>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <img src="/icons/icon-192x192.png" alt="Alash Electronics" className="w-16 h-16 rounded-2xl object-contain mb-3" />
          </Link>
          <span className="text-lg font-bold text-gray-900">Alash Electronics</span>
        </div>
        <h1 className="text-xl font-bold mb-6 text-center">Новый пароль</h1>
        <Suspense fallback={<p className="text-center text-gray-500">Загрузка...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
