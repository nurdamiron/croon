'use client'

import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  current: number
  selectedSubs: string[]
  sort: string
}

const OPTIONS = [20, 50, 100]

export default function PerPageSelect({ slug, current, selectedSubs, sort }: Props) {
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const per = parseInt(e.target.value)
    const parts: string[] = []
    if (sort && sort !== 'default') parts.push(`sort=${sort}`)
    if (selectedSubs.length > 0) parts.push(`sub=${selectedSubs.join(',')}`)
    if (per !== OPTIONS[0]) parts.push(`per=${per}`)
    const qs = parts.length > 0 ? `?${parts.join('&')}` : ''
    router.push(`/collection/${slug}${qs}`)
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="border rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand bg-white min-h-[44px]"
      aria-label="Товаров на странице"
    >
      {OPTIONS.map(n => (
        <option key={n} value={n}>по {n}</option>
      ))}
    </select>
  )
}
