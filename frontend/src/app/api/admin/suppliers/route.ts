import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  if (process.env.NODE_ENV === 'development') {
    return { user: { id: 'dev-admin-id', role: 'ADMIN' } }
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { receipts: true } },
    },
  })

  return NextResponse.json({ suppliers })
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { name, contactInfo, notes } = await request.json()

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Название поставщика обязательно (мин. 2 символа)' }, { status: 400 })
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        contactInfo: contactInfo?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json({ supplier })
  } catch (error: any) {
    console.error('Ошибка создания поставщика:', error)
    return NextResponse.json({ error: error.message || 'Ошибка сервера' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id, name, contactInfo, notes } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID поставщика обязателен' }, { status: 400 })
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(contactInfo !== undefined && { contactInfo: contactInfo?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
    })

    return NextResponse.json({ supplier })
  } catch (error: any) {
    console.error('Ошибка обновления поставщика:', error)
    return NextResponse.json({ error: error.message || 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID поставщика обязателен' }, { status: 400 })
    }

    await prisma.supplier.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Ошибка удаления поставщика:', error)
    return NextResponse.json({ error: error.message || 'Ошибка сервера' }, { status: 500 })
  }
}
