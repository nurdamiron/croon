'use client'

import { useState } from 'react'
import { useToast } from '@/components/Toast'

interface Supplier {
  id: string
  name: string
  contactInfo: string | null
  notes: string | null
  createdAt: string
  _count: { receipts: number }
}

export default function SuppliersClient({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const resetForm = () => {
    setName('')
    setContactInfo('')
    setNotes('')
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (s: Supplier) => {
    setEditingId(s.id)
    setName(s.name)
    setContactInfo(s.contactInfo || '')
    setNotes(s.notes || '')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Название обязательно (мин. 2 символа)')
      return
    }
    setSaving(true)
    try {
      const url = '/api/admin/suppliers'
      const method = editingId ? 'PATCH' : 'POST'
      const body: any = { name, contactInfo, notes }
      if (editingId) body.id = editingId

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (editingId) {
        setSuppliers(suppliers.map((s) => (s.id === editingId ? { ...s, ...data.supplier } : s)))
        toast.success('Поставщик обновлён')
      } else {
        setSuppliers([...suppliers, { ...data.supplier, _count: { receipts: 0 } }].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Поставщик создан')
      }
      resetForm()
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Удалить поставщика "${name}"? Приёмки останутся в истории.`)) return
    try {
      const res = await fetch(`/api/admin/suppliers?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      setSuppliers(suppliers.filter((s) => s.id !== id))
      toast.success('Поставщик удалён')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    }
  }

  return (
    <div className="space-y-4">
      {/* Форма */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
            {editingId ? 'Редактировать поставщика' : 'Новый поставщик'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Название *</label>
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                placeholder="ООО Радиодетали"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Контакты</label>
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                placeholder="Телефон, email, сайт"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Заметки</label>
              <input
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:bg-white focus:border-admin focus:ring-4 focus:ring-admin/10 transition-all"
                placeholder="Доп. информация"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-admin hover:bg-admin-hover disabled:bg-admin/50 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              {saving ? 'Сохранение...' : editingId ? 'Обновить' : 'Создать'}
            </button>
            <button onClick={resetForm} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold transition-colors">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Кнопка добавления */}
      {!showForm && (
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-admin hover:bg-admin-hover text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
        >
          + Добавить поставщика
        </button>
      )}

      {/* Таблица */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[13px] font-medium text-gray-500">Поставщиков пока нет</p>
            <p className="text-[11px] text-gray-400 mt-1">Добавьте первого поставщика для приёмки товаров</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-4">Название</th>
                <th className="py-3 px-4">Контакты</th>
                <th className="py-3 px-4">Заметки</th>
                <th className="py-3 px-4 text-center">Приёмок</th>
                <th className="py-3 px-4 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[13px]">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-gray-800">{s.name}</td>
                  <td className="py-3 px-4 text-gray-500 text-[12px]">{s.contactInfo || '—'}</td>
                  <td className="py-3 px-4 text-gray-500 text-[12px] max-w-[200px] truncate">{s.notes || '—'}</td>
                  <td className="py-3 px-4 text-center text-gray-500">{s._count.receipts}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => startEdit(s)} className="text-gray-400 hover:text-admin transition-colors p-1 rounded-lg hover:bg-blue-50" title="Редактировать">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(s.id, s.name)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
