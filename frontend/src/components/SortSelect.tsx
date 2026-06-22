'use client'

import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  current: string
  selectedSubs: string[]
  options: { value: string; label: string }[]
  per?: number
}

export default function SortSelect({ slug, current, selectedSubs, options, per }: Props) {
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    const parts: string[] = []
    if (val && val !== 'default') parts.push(`sort=${val}`)
    if (selectedSubs.length > 0) parts.push(`sub=${selectedSubs.join(',')}`)
    if (per && per !== 20) parts.push(`per=${per}`)
    const qs = parts.length > 0 ? `?${parts.join('&')}` : ''
    router.push(`/collection/${slug}${qs}`)
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="md:hidden border rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand bg-white min-h-[44px] flex-1"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
