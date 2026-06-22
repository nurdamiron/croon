'use client'

import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react'

type ToastType = 'success' | 'error' | 'loading'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  success: (msg: string) => void
  error: (msg: string) => void
  loading: (msg: string) => { resolve: (msg: string) => void; reject: (msg: string) => void }
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const add = useCallback((message: string, type: ToastType, duration = 3000) => {
    const id = ++idCounter
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    if (duration > 0) {
      const t = setTimeout(() => remove(id), duration)
      timers.current.set(id, t)
    }
    return id
  }, [remove])

  const success = useCallback((msg: string) => { add(msg, 'success') }, [add])
  const error = useCallback((msg: string) => { add(msg, 'error') }, [add])

  const loading = useCallback((msg: string) => {
    const id = add(msg, 'loading', 0)
    return {
      resolve: (doneMsg: string) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, message: doneMsg, type: 'success' } : t))
        const t = setTimeout(() => remove(id), 3000)
        timers.current.set(id, t)
      },
      reject: (errMsg: string) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, message: errMsg, type: 'error' } : t))
        const t = setTimeout(() => remove(id), 4000)
        timers.current.set(id, t)
      },
    }
  }, [add, remove])

  const icons = {
    success: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    error: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    ),
    loading: (
      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
    ),
  }

  const colors = {
    success: 'bg-gray-900',
    error: 'bg-red-600',
    loading: 'bg-gray-800',
  }

  return (
    <ToastContext.Provider value={{ success, error, loading }}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-white text-[13px] font-medium shadow-lg pointer-events-auto
              ${colors[t.type]} animate-in fade-in slide-in-from-bottom-2 duration-200`}
            style={{ animation: 'toastIn 0.2s ease' }}
          >
            <span className={t.type === 'success' ? 'text-green-400' : t.type === 'error' ? 'text-red-200' : 'text-white'}>
              {icons[t.type]}
            </span>
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1);    }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
