import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [pages, blogPosts] = await Promise.all([
    prisma.page.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } }),
  ])

  return NextResponse.json({ pages, blogPosts })
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { type, id, title, slug, content, blogSlug } = await request.json()

  if (type === 'blog') {
    const post = await prisma.blogPost.update({
      where: { id },
      data: { title, slug, content, blogSlug },
    })
    return NextResponse.json(post)
  }

  const page = await prisma.page.update({
    where: { id },
    data: { title, slug, content },
  })
  return NextResponse.json(page)
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { type, title, slug, content, blogSlug } = await request.json()

  if (type === 'blog') {
    const post = await prisma.blogPost.create({
      data: { title, slug, content, blogSlug: blogSlug || 'blog' },
    })
    return NextResponse.json(post, { status: 201 })
  }

  const page = await prisma.page.create({
    data: { title, slug, content },
  })
  return NextResponse.json(page, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { type, id } = await request.json()

  if (type === 'blog') {
    await prisma.blogPost.delete({ where: { id } })
  } else {
    await prisma.page.delete({ where: { id } })
  }

  return NextResponse.json({ ok: true })
}
