'use client'

import { useState, useEffect } from 'react'
import NotificationSwitches from './NotificationSwitches'

const DEFAULTS: Record<string, string> = {
  // Shop info
  shopName:    'Alash Electronics',
  shopPhone:   '+7(700) 900-17-90',
  shopEmail:   'info@alash-electronics.kz',
  shopAddress: 'ул. Кыз Жибек, 104/1, Алматы',
  shopHours:   'Пн–Сб 12:00–20:00',
  // Social
  whatsapp:    '77009001790',
  telegram:    'alash_electronics',
  instagram:   '',
  // Delivery
  freeDelivery: '150000',
  pickupAddress: 'ул. Кыз Жибек, 104/1, Кок-Тобе 2 м-н, Медеуский район, Алматы 050020',
  // Notifications
  lowStock:    '5',
  // SEO
  seoTitle:    'Alash Electronics — электронные компоненты и модули в Казахстане',
  seoDesc:     'Интернет-магазин электронных компонентов: Arduino, ESP32, датчики, модули, инструменты. Доставка по Казахстану.',
}

interface Section {
  id: string
  title: string
  icon: React.ReactNode
  description: string
  fields: {
    key: string
    label: string
    type?: string
    placeholder?: string
    hint?: string
    prefix?: string
  }[]
}

const SECTIONS: Section[] = [
  {
    id: 'shop',
    title: 'Информация о магазине',
    description: 'Отображается на сайте и в документах',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    fields: [
      { key: 'shopName',    label: 'Название магазина', placeholder: 'Alash Electronics' },
      { key: 'shopPhone',   label: 'Телефон', type: 'tel', placeholder: '+7 (___) ___-__-__' },
      { key: 'shopEmail',   label: 'Email', type: 'email', placeholder: 'info@example.com' },
      { key: 'shopAddress', label: 'Адрес магазина', placeholder: 'ул. Кыз Жибек, 104/1, Алматы' },
      { key: 'shopHours',   label: 'Часы работы', placeholder: 'Пн–Сб 12:00–20:00' },
    ],
  },
  {
    id: 'social',
    title: 'Социальные сети и мессенджеры',
    description: 'Используются для кнопок связи в заказах и на сайте',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    fields: [
      {
        key: 'whatsapp', label: 'WhatsApp', type: 'tel', placeholder: '77009001790',
        hint: 'Только цифры, с кодом страны: 77001234567',
        prefix: 'wa.me/',
      },
      {
        key: 'telegram', label: 'Telegram', placeholder: 'alash_electronics',
        hint: 'Username без @',
        prefix: 't.me/',
      },
      {
        key: 'instagram', label: 'Instagram', placeholder: 'alash.electronics',
        hint: 'Username без @, необязательно',
        prefix: 'instagram.com/',
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Доставка',
    description: 'Настройки доставки и самовывоза',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
    fields: [
      {
        key: 'freeDelivery', label: 'Порог бесплатной доставки (тг)', type: 'number',
        placeholder: '150000',
        hint: 'При заказе от этой суммы — доставка бесплатно. Сейчас: 150 000 тг.',
      },
      {
        key: 'pickupAddress', label: 'Адрес самовывоза (полный)',
        placeholder: 'ул. Кыз Жибек, 104/1, Алматы',
        hint: 'Показывается при оформлении заказа и на странице успеха',
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Уведомления и дашборд',
    description: 'Параметры системных предупреждений',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
    ),
    fields: [
      {
        key: 'lowStock', label: 'Порог низкого остатка (шт)', type: 'number',
        placeholder: '5',
        hint: 'Товары с остатком ≤ этого значения выделяются оранжевым на дашборде',
      },
    ],
  },
  {
    id: 'push',
    title: 'Push-уведомления по каналам',
    description: 'Включить/выключить пуш по конкретному каналу продаж',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 17H2a3 3 0 003-3V9a7 7 0 0114 0v5a3 3 0 003 3z"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
    ),
    fields: [],
  },
  {
    id: 'seo',
    title: 'SEO — мета-теги главной страницы',
    description: 'Title и description для поисковиков',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    ),
    fields: [
      {
        key: 'seoTitle', label: 'Meta Title',
        placeholder: 'Alash Electronics — электронные компоненты...',
        hint: 'Оптимально 50–60 символов',
      },
      {
        key: 'seoDesc', label: 'Meta Description',
        placeholder: 'Интернет-магазин...',
        hint: 'Оптимально 150–160 символов',
      },
    ],
  },
]

export default function AdminSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('shop')

  // Load saved settings from DB
  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setValues(prev => ({ ...prev, ...data }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Ошибка сохранения')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const currentSection = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0]

  return (
    <div className="max-w-[900px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Настройки</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Управление параметрами магазина</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          hidden={activeSection === 'push'}
          className="flex items-center gap-2 px-4 py-2 bg-admin text-white rounded-xl text-[13px] font-semibold hover:bg-admin-hover disabled:opacity-40 transition-colors shadow-sm"
        >
          {saving ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Сохраняем...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Сохранить
            </>
          )}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-5">
        {/* Left nav */}
        <div className="sm:w-[200px] shrink-0">
          <nav className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {SECTIONS.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-b border-gray-100 last:border-0 ${
                  activeSection === section.id
                    ? 'bg-admin/5 text-admin'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className={`shrink-0 ${activeSection === section.id ? 'text-admin' : 'text-gray-400'}`}>
                  {section.icon}
                </span>
                <span className="text-[13px] font-medium leading-tight">{section.title.split(' ')[0]}</span>
              </button>
            ))}
          </nav>

          {/* Info card */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-[11px] text-amber-700 leading-relaxed">
              <span className="font-semibold">Важно:</span> некоторые настройки (порог доставки, адрес) используются в коде. После изменения убедитесь что всё отображается корректно.
            </p>
          </div>
        </div>

        {/* Right: active section form */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* Section header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-admin/8 flex items-center justify-center text-admin shrink-0 mt-0.5">
                {currentSection.icon}
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">{currentSection.title}</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">{currentSection.description}</p>
              </div>
            </div>

            {/* Fields */}
            <div className="p-6 space-y-5">
              {currentSection.id === 'push' ? (
                <NotificationSwitches />
              ) : loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="w-24 h-3 bg-gray-200 rounded mb-2" />
                      <div className="w-full h-10 bg-gray-100 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : (
                currentSection.fields.map(field => {
                  const charCount = field.hint?.includes('символ') ? values[field.key]?.length || 0 : null
                  return (
                    <div key={field.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[13px] font-semibold text-gray-700">{field.label}</label>
                        {charCount !== null && (
                          <span className={`text-[11px] font-mono ${charCount > 160 ? 'text-red-500' : charCount > 100 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {charCount} симв.
                          </span>
                        )}
                      </div>

                      {/* Input with optional prefix */}
                      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-admin focus-within:ring-2 focus-within:ring-admin/10 transition-all">
                        {field.prefix && (
                          <span className="px-3 py-2.5 bg-gray-50 border-r border-gray-200 text-[12px] text-gray-400 font-mono whitespace-nowrap shrink-0">
                            {field.prefix}
                          </span>
                        )}
                        {field.key === 'seoDesc' || field.key === 'pickupAddress' ? (
                          <textarea
                            value={values[field.key] || ''}
                            onChange={e => handleChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            rows={2}
                            className="flex-1 px-3 py-2.5 text-[13px] outline-none bg-white resize-none text-gray-800 placeholder-gray-300"
                          />
                        ) : (
                          <input
                            type={field.type || 'text'}
                            value={values[field.key] || ''}
                            onChange={e => handleChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="flex-1 px-3 py-2.5 text-[13px] outline-none bg-white text-gray-800 placeholder-gray-300"
                          />
                        )}
                      </div>

                      {field.hint && (
                        <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{field.hint}</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Save toast */}
      {saved && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gray-900 text-white text-[13px] font-medium rounded-xl shadow-xl animate-in slide-in-from-bottom-2 duration-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Настройки сохранены
        </div>
      )}
    </div>
  )
}
