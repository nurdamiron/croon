import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import AdminShell from './AdminShell'

export const metadata: Metadata = {
  title: 'Админ-панель',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  const newOrderCount = await prisma.order.count({ where: { status: 'NEW' } })

  return (
    <>
      {/* Hide parent header/footer — all values are hardcoded CSS, no user input */}
      <style dangerouslySetInnerHTML={{ __html: `
        header:has(nav a[href="/"]), footer:has(a[href="/"]),
        body > script + div > header, body > script + div > footer {
          display: none !important;
        }
        body {
          background: #f4f5f7 !important;
          color-scheme: light;
        }
      `}} />

      <AdminShell newOrderCount={newOrderCount}>
        {children}
      </AdminShell>
    </>
  )
}
