import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Заказ оформлен',
  robots: { index: false, follow: false },
}

export default function CheckoutSuccessLayout({ children }: { children: React.ReactNode }) {
  return children
}
