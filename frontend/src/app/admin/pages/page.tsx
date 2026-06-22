'use client'

import { useEffect, useState } from 'react'

interface PageItem {
  id: string
  title: string
  slug: string
  content: string
  blogSlug?: string
}

export default function AdminPagesPage() {
  const [pages, setPages] = useState<PageItem[]>([])
  const [blogPosts, setBlogPosts] = useState<PageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PageItem | null>(null)
  const [editType, setEditType] = useState<'page' | 'blog'>('page')
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({ title: '', slug: '', content: '', blogSlug: 'blog' })
  const [tab, setTab] = useState<'pages' | 'blog'>('pages')

  const loadData = async () => {
    const res = await fetch('/api/admin/pages')
    if (res.ok) {
      const data = await res.json()
      setPages(data.pages || [])
      setBlogPosts(data.blogPosts || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const startEdit = (item: PageItem, type: 'page' | 'blog') => {
    setEditing(item)
    setEditType(type)
    setIsNew(false)
    setForm({ title: item.title, slug: item.slug, content: item.content, blogSlug: item.blogSlug || 'blog' })
  }

  const startNew = (type: 'page' | 'blog') => {
    setEditing(null)
    setEditType(type)
    setIsNew(true)
    setForm({ title: '', slug: '', content: '', blogSlug: 'blog' })
  }

  const handleSave = async () => {
    const method = isNew ? 'POST' : 'PUT'
    const body = isNew
      ? { type: editType, ...form }
      : { type: editType, id: editing!.id, ...form }

    const res = await fetch('/api/admin/pages', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setEditing(null)
      setIsNew(false)
      loadData()
    }
  }

  const handleDelete = async (id: string, type: 'page' | 'blog', title: string) => {
    if (!confirm(`Удалить "${title}"?`)) return
    const res = await fetch('/api/admin/pages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    })
    if (res.ok) loadData()
  }

  const items = tab === 'pages' ? pages : blogPosts

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Страницы и блог</h1>
        <div className="flex gap-2">
          <button onClick={() => startNew('page')} className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            + Страница
          </button>
          <button onClick={() => startNew('blog')} className="bg-green-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm hover:bg-green-700">
            + Блог пост
          </button>
        </div>
      </div>

      {/* Edit form */}
      {(editing || isNew) && (
        <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
          <h3 className="font-bold mb-4">
            {isNew ? `Новая ${editType === 'page' ? 'страница' : 'статья'}` : `Редактирование: ${editing!.title}`}
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Заголовок</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Slug</label>
                <input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Содержимое (HTML)</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600 resize-none font-mono" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Сохранить</button>
              <button onClick={() => { setEditing(null); setIsNew(false) }} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('pages')}
          className={`px-4 py-2 rounded-lg text-sm ${tab === 'pages' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          Страницы ({pages.length})
        </button>
        <button
          onClick={() => setTab('blog')}
          className={`px-4 py-2 rounded-lg text-sm ${tab === 'blog' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          Блог ({blogPosts.length})
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-center">Загрузка...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-gray-500 text-center">Пусто</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 font-medium">Заголовок</th>
                <th className="text-left p-3 font-medium">URL</th>
                <th className="p-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{item.title}</td>
                  <td className="p-3 text-gray-500 text-xs">
                    {tab === 'pages' ? `/page/${item.slug}` : `/blogs/${item.blogSlug}/${item.slug}`}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(item, tab === 'pages' ? 'page' : 'blog')} className="p-1.5 text-gray-400 hover:text-blue-600">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(item.id, tab === 'pages' ? 'page' : 'blog', item.title)} className="p-1.5 text-gray-400 hover:text-red-500">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
