'use client'

import { usePathname } from 'next/navigation'

export default function ManifestLink() {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')
  return <link rel="manifest" href={isAdmin ? '/manifest-admin.json' : '/manifest.json'} />
}
