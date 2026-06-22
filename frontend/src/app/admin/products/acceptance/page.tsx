import { requireAdmin } from '@/lib/admin'
import AcceptanceClient from './AcceptanceClient'

export const dynamic = 'force-dynamic'

export default async function AcceptancePage() {
  await requireAdmin()
  return <AcceptanceClient />
}
