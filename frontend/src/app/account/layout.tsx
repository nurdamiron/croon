import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Личный кабинет',
  robots: { index: false, follow: true },
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children
}
