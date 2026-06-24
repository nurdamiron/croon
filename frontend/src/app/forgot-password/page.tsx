'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        setError('Ошибка. Попробуйте ещё раз.')
      }
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-16">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/client_account/login">
            <span className="text-4xl font-black tracking-widest text-brand select-none">КРУН</span>
          </Link>
        </div>

        <h1 className="text-xl font-bold mb-2 text-center">Восстановление пароля</h1>

        {sent ? (
          <div className="border rounded-lg p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="font-medium">Ссылка отправлена!</p>
            <p className="text-sm text-gray-500">
              Проверьте вашу почту. Если письмо не пришло, проверьте папку «Спам».
            </p>
            <Link href="/client_account/login" className="text-sm text-brand hover:text-brand-hover">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              Введите email от вашего аккаунта. Мы отправим ссылку для создания нового пароля.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
                placeholder="email@example.com"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:bg-gray-400"
            >
              {loading ? 'Отправка...' : 'Отправить ссылку'}
            </button>
            <div className="text-center">
              <Link href="/client_account/login" className="text-sm text-gray-500 hover:text-brand">
                Вернуться ко входу
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
