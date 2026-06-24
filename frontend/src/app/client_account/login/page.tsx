'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession, getSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role
      if (role === 'ADMIN') {
        router.replace('/admin')
      } else {
        setError('Доступ разрешен только администраторам')
        signOut({ redirect: false })
      }
    }
  }, [status, session, router])

  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email: form.email,
      password: form.password,
      redirect: false,
    })

    if (result?.error) {
      setError('Неверный email или пароль')
    } else {
      const s = await getSession()
      const role = (s?.user as any)?.role
      if (role === 'ADMIN') {
        router.push('/admin')
        router.refresh()
      } else {
        setError('Доступ разрешен только администраторам')
        await signOut({ redirect: false })
      }
    }
    setLoading(false)
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-16">
      <div className="max-w-md mx-auto">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/admin">
            <span className="text-4xl font-black tracking-widest text-brand select-none">КРУН</span>
          </Link>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-2.5 text-base outline-none focus:border-brand"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                minLength={6}
                value={form.password}
                onChange={handleChange}
                className="w-full border rounded-lg px-4 py-2.5 pr-11 text-base outline-none focus:border-brand"
                placeholder="Минимум 6 символов"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:bg-gray-400"
          >
            {loading ? 'Загрузка...' : 'Войти'}
          </button>

          <div className="text-center">
            <Link href="/forgot-password" className="text-sm text-brand hover:text-brand-hover">
              Забыли пароль?
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
