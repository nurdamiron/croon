'use client'

import { useRef, useState } from 'react'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  className?: string
  placeholder?: string
}

// Format 10 national digits → "+7 (700) 900-17-90"
function formatPhone(digits: string): string {
  const d = digits.slice(0, 10)
  let out = '+7'
  if (d.length === 0) return out
  out += ' (' + d.slice(0, 3)
  if (d.length <= 3) return out            // +7 (XXX   — незакрытая скобка пока не набраны следующие цифры
  out += ') ' + d.slice(3, 6)
  if (d.length <= 6) return out            // +7 (XXX) YYY — без дефиса
  out += '-' + d.slice(6, 8)
  if (d.length <= 8) return out            // +7 (XXX) YYY-ZZ — без второго дефиса
  out += '-' + d.slice(8, 10)
  return out                               // +7 (XXX) YYY-ZZ-WW
}

// Extract exactly 10 national digits, stripping country code prefix
function extractDigits(raw: string): string {
  // Strip +7 country code prefix first (handles "+7 ", "+7(", "+7")
  const stripped = raw.replace(/^\+7\s*[\(\-]?/, '')
  const digits = stripped.replace(/\D/g, '')

  // If still 11 digits starting with 7 or 8 (paste without proper stripping)
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return digits.slice(1)
  }

  return digits.slice(0, 10)
}

// For paste: handle any raw format (87001234567, +77001234567, 7001234567, etc.)
function extractDigitsFromPaste(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return digits.slice(1)
  }
  if (digits.length === 12 && digits.startsWith('77')) {
    return digits.slice(2)
  }
  return digits.slice(0, 10)
}

export default function PhoneInput({ value, onChange, required, className, placeholder }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)

  // Only extract digits from actual value (not the visual "+7 " prefix trick)
  const digits = value ? extractDigits(value) : ''

  // Show "+7 " visual hint when focused and empty, otherwise show formatted
  const displayValue = digits.length > 0
    ? formatPhone(digits)
    : focused ? '+7 ' : ''

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    const raw = e.target.value

    // User deleted everything or just left the prefix
    const d = extractDigits(raw)
    if (d.length === 0) {
      onChange('')
      return
    }

    onChange(formatPhone(d))

    // Keep cursor at end
    setTimeout(() => {
      if (inputRef.current) {
        const len = inputRef.current.value.length
        inputRef.current.selectionStart = len
        inputRef.current.selectionEnd = len
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      // Always intercept — let us delete the last digit, not a separator char
      e.preventDefault()
      if (digits.length === 0) return
      const newDigits = digits.slice(0, -1)
      onChange(newDigits ? formatPhone(newDigits) : '')
    }
  }

  const handleFocus = () => {
    setFocused(true)
    setError('')
    // Place cursor at end — don't change form value here
    setTimeout(() => {
      if (inputRef.current) {
        const len = inputRef.current.value.length
        inputRef.current.setSelectionRange(len, len)
      }
    }, 0)
  }

  const handleBlur = () => {
    setFocused(false)
    if (digits.length > 0 && digits.length < 10) {
      setError('Введите полный номер телефона')
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const d = extractDigitsFromPaste(pasted)
    if (d.length === 0) return
    onChange(formatPhone(d))
  }

  const isComplete = digits.length === 10
  const showError = error && !focused

  return (
    <div className="relative">
      <div className={`relative flex items-center border rounded-lg transition-colors ${
        focused
          ? 'border-brand ring-1 ring-brand/20'
          : showError
          ? 'border-red-400'
          : isComplete
          ? 'border-green-400'
          : 'border-gray-300'
      }`}>
        <span className="pl-3 text-lg select-none shrink-0">🇰🇿</span>

        <input
          ref={inputRef}
          type="tel"
          inputMode="tel"
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          required={required}
          placeholder={focused ? '' : (placeholder ?? '+7 (___) ___-__-__')}
          className={`w-full bg-transparent px-3 py-2.5 text-base outline-none font-mono tracking-wide ${className ?? ''}`}
        />

        {isComplete && !focused && (
          <span className="pr-3 text-green-500 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        )}

        {focused && digits.length > 0 && !isComplete && (
          <span className="pr-3 text-xs text-gray-400 shrink-0 tabular-nums">
            {digits.length}/10
          </span>
        )}
      </div>

      {showError && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}
