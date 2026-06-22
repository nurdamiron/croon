'use client'

import { useState, useCallback } from 'react'
import { marked } from 'marked'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

type Tab = 'write' | 'preview'

function insertAround(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  setValue: (v: string) => void
) {
  const { selectionStart: s, selectionEnd: e, value } = textarea
  const selected = value.slice(s, e) || 'текст'
  const next = value.slice(0, s) + before + selected + after + value.slice(e)
  setValue(next)
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(s + before.length, s + before.length + selected.length)
  }, 0)
}

function insertLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
  setValue: (v: string) => void
) {
  const { selectionStart: s, value } = textarea
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
  setValue(next)
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(s + prefix.length, s + prefix.length)
  }, 0)
}

const TOOLBAR = [
  { label: 'B', title: 'Жирный (Ctrl+B)', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertAround(ta, '**', '**', set) },
  { label: 'I', title: 'Курсив (Ctrl+I)', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertAround(ta, '_', '_', set) },
  { label: 'H2', title: 'Заголовок 2', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertLine(ta, '## ', set) },
  { label: 'H3', title: 'Заголовок 3', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertLine(ta, '### ', set) },
  { label: '— —', title: 'Разделитель', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => { const v = ta.value; set(v + '\n\n---\n\n') } },
  { label: '• список', title: 'Список', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertLine(ta, '- ', set) },
  { label: '1. список', title: 'Нумерованный список', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertLine(ta, '1. ', set) },
  { label: '🔗', title: 'Ссылка', action: (ta: HTMLTextAreaElement, set: (v: string) => void) => insertAround(ta, '[', '](https://)', set) },
]

export default function MarkdownEditor({ value, onChange, placeholder, rows = 16 }: Props) {
  const [tab, setTab] = useState<Tab>('write')
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null)

  const handleToolbar = useCallback((action: (ta: HTMLTextAreaElement, set: (v: string) => void) => void) => {
    if (!textareaRef) return
    action(textareaRef, onChange)
  }, [textareaRef, onChange])

  const preview = tab === 'preview' ? (marked.parse(value || '') as string) : ''

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-gray-50">
        {(['write', 'preview'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-medium transition-colors ${
              tab === t
                ? 'text-admin border-b-2 border-admin bg-white -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'write' ? 'Редактор' : 'Превью'}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400 px-3">Markdown</span>
      </div>

      {/* Toolbar (write mode only) */}
      {tab === 'write' && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
          {TOOLBAR.map(btn => (
            <button
              key={btn.label}
              type="button"
              title={btn.title}
              onClick={() => handleToolbar(btn.action)}
              className="px-2 py-1 text-[11px] font-mono bg-white border border-gray-200 rounded hover:border-admin hover:text-admin transition-colors"
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      {tab === 'write' && (
        <textarea
          ref={el => setTextareaRef(el)}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder || 'Введите текст в формате Markdown...'}
          className="w-full px-4 py-3 text-[13px] font-mono leading-relaxed outline-none resize-y bg-white text-gray-800 placeholder-gray-400"
          spellCheck={false}
        />
      )}

      {/* Preview */}
      {tab === 'preview' && (
        <div
          className="px-4 py-3 prose prose-sm max-w-none min-h-[200px] bg-white text-gray-800"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      )}
    </div>
  )
}
