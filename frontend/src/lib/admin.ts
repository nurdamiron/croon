import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { redirect } from 'next/navigation'

export async function requireAdmin() {
  if (process.env.NODE_ENV === 'development') {
    return {
      user: {
        id: 'dev-admin-id',
        email: 'admin@alash-electronics.kz',
        name: 'Dev Admin',
        role: 'ADMIN',
      }
    }
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    redirect('/client_account/login')
  }
  return session
}
