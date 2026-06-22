import type { Metadata } from 'next'
import Link from 'next/link'
import { getCategories, getAllPageSlugs, getAllBlogPosts } from '@/lib/data'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Карта сайта',
  description: 'Карта сайта Alash Electronics — все разделы, категории, товары и статьи. Доставка по Алматы и всему Казахстану.',
  alternates: { canonical: '/karta-sayta' },
}

export default async function SitemapPage() {
  const [categories, pages, blogPosts, topProducts] = await Promise.all([
    getCategories(),
    getAllPageSlugs(),
    getAllBlogPosts(),
    prisma.product.findMany({
      where: { inStock: true },
      select: { slug: true, name: true, categoryId: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
  ])

  const rootId = categories.find(c => c.name === 'Каталог')?.id
  const topLevel = categories.filter(c => c.parentId === rootId)
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId)
  const getGrandchildren = (parentId: string) =>
    getChildren(parentId).flatMap(c => getChildren(c.id))

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Карта сайта</h1>
      <p className="text-gray-600 text-sm mb-4 leading-relaxed">
        Полный перечень разделов интернет-магазина Alash Electronics: каталог электронных компонентов, Arduino, датчиков и модулей, информационные страницы о доставке и оплате, блог с обзорами и инструкциями.
      </p>
      <p className="text-gray-500 text-sm mb-8 leading-relaxed">
        Доставка по Алматы и Казахстану. Самовывоз: ул. Кыз Жибек, 104/1. Тел. +7 (700) 900-17-90.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

        {/* Main pages */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-brand border-b pb-2">Основные страницы</h2>
          <ul className="space-y-1.5 text-sm">
            <li><Link href="/" className="hover:text-brand">Главная</Link></li>
            <li><Link href="/collection/all" className="hover:text-brand">Все товары</Link></li>
            <li><Link href="/cart" className="hover:text-brand">Корзина</Link></li>
            <li><Link href="/favorites" className="hover:text-brand">Избранное</Link></li>
            <li><Link href="/page/contacts" className="hover:text-brand">Контакты</Link></li>
            <li><Link href="/page/oferta" className="hover:text-brand">Оферта и конфиденциальность</Link></li>
            <li><Link href="/page/payment-2" className="hover:text-brand">Оплата</Link></li>
            <li><Link href="/page/alashed" className="hover:text-brand">AlashEd — Гос.закуп</Link></li>
          </ul>

          {pages.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mt-6 mb-3 text-brand border-b pb-2">Статьи и страницы</h2>
              <ul className="space-y-1.5 text-sm">
                {pages.filter((p: { slug: string }) => !['contacts', 'oferta', 'payment-2', 'alashed'].includes(p.slug)).map((p: { slug: string }) => (
                  <li key={p.slug}>
                    <Link href={`/page/${p.slug}`} className="hover:text-brand capitalize">{p.slug.replace(/-/g, ' ')}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {blogPosts.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mt-6 mb-3 text-brand border-b pb-2">Блог</h2>
              <ul className="space-y-1.5 text-sm">
                {blogPosts.map((post: { slug: string; blogSlug: string }) => (
                  <li key={post.slug}>
                    <Link href={`/blogs/${post.blogSlug}/${post.slug}`} className="hover:text-brand">{post.slug.replace(/-/g, ' ')}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Categories */}
        <section className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3 text-brand border-b pb-2">Каталог товаров</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {topLevel.map(cat => {
              const children = getChildren(cat.id)
              return (
                <div key={cat.id}>
                  <Link href={`/collection/${cat.slug}`} className="font-medium text-sm hover:text-brand block mb-1">
                    {cat.name}
                  </Link>
                  {children.length > 0 && (
                    <ul className="pl-3 space-y-0.5">
                      {children.map(child => {
                        const grandchildren = getChildren(child.id)
                        return (
                          <li key={child.id}>
                            <Link href={`/collection/${child.slug}`} className="text-xs text-gray-600 hover:text-brand">
                              {child.name}
                            </Link>
                            {grandchildren.length > 0 && (
                              <ul className="pl-3 space-y-0.5 mt-0.5">
                                {grandchildren.map(gc => (
                                  <li key={gc.id}>
                                    <Link href={`/collection/${gc.slug}`} className="text-xs text-gray-400 hover:text-brand">
                                      {gc.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>

          {/* Recent products */}
          {topProducts.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mt-8 mb-3 text-brand border-b pb-2">Товары в наличии</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {topProducts.map((p: { slug: string; name: string }) => (
                  <li key={p.slug} className="text-xs">
                    <Link href={`/product/${p.slug}`} className="hover:text-brand line-clamp-1">{p.name}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
