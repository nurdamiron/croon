import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getBlogPost, getCategories } from '@/lib/data'
import Link from 'next/link'
import SafeHtml from '@/components/SafeHtml'
import Sidebar from '@/components/LazySidebar'
import { cleanDescription, smartTitle, SITE_URL } from '@/lib/seo'

interface Props {
  params: { blog: string; slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getBlogPost(params.slug)
  if (!post) return { title: 'Статья не найдена' }
  const short = smartTitle(post.title)
  const title = short ?? post.title
  const contentDesc = cleanDescription(post.content, 110)
  const description = contentDesc
    ? `${contentDesc} — ${post.title.slice(0, 25)}`
    : post.title
  return {
    title,
    description,
    alternates: { canonical: `/blogs/${post.blogSlug}/${post.slug}` },
    openGraph: {
      title: `${short ?? post.title} — ИП КРУН`,
      description,
      type: 'article',
      locale: 'ru_KZ',
      url: `/blogs/${post.blogSlug}/${post.slug}`,
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: post.title }],
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const [post, categories] = await Promise.all([
    getBlogPost(params.slug),
    getCategories(),
  ])
  if (!post) return notFound()

  // BreadcrumbList JSON-LD: built from trusted DB fields — safe to inject
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Блог', item: `${SITE_URL}/blogs/${post.blogSlug}` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blogs/${post.blogSlug}/${post.slug}` },
    ],
  }

  // Article JSON-LD: built from trusted DB fields — safe to inject
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: cleanDescription(post.content) || post.title,
    datePublished: post.createdAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    url: `${SITE_URL}/blogs/${post.blogSlug}/${post.slug}`,
    image: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.jpg`, width: 1200, height: 630 },
    author: {
      '@type': 'Organization',
      name: 'ИП КРУН',
      url: SITE_URL,
      sameAs: ['https://croon.kz'],
    },
    publisher: {
      '@type': 'Organization',
      name: 'ИП КРУН',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.jpg`, width: 1200, height: 630 },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blogs/${post.blogSlug}/${post.slug}` },
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      {/* BreadcrumbList JSON-LD: blog post data from DB, safely serialized */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {/* Article JSON-LD: blog post data from DB, safely serialized */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <Sidebar categories={categories} />
      <main className="flex-1 min-w-0">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:text-brand">Главная</Link>
          <span className="mx-1">/</span>
          <Link href={`/blogs/${post.blogSlug}`} className="hover:text-brand">Блог</Link>
          <span className="mx-1">/</span>
          <span className="text-gray-800">{post.title}</span>
        </nav>
        <h1 className="text-2xl font-bold mb-3">{post.title}</h1>
        <div className="text-sm text-gray-500 mb-6 flex items-center gap-2">
          <time dateTime={post.createdAt.toISOString()}>
            {post.createdAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </time>
          {post.updatedAt > post.createdAt && (
            <span>• Обновлено {post.updatedAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          )}
          <span>• ИП КРУН</span>
        </div>
        <SafeHtml html={post.content} className="prose max-w-none" />

        <div className="mt-8 pt-6 border-t space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            Готовые наборы и комплектующие для проекта можно заказать в каталоге ИП КРУН с доставкой по Костанаю и Казахстану. Самовывоз — Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Заказ онлайн или по тел. +7 (700) 900-17-90. Оплата при получении. Бесплатная доставка от 150 000 ₸.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/collection/gotovye-nabory-dlya-robototehniki" className="text-brand hover:text-brand-hover font-medium">
            → Готовые наборы для робототехники
          </Link>
          <Link href="/collection/all" className="text-gray-600 hover:text-brand">
            Весь каталог
          </Link>
          <Link href="/page/delivery" className="text-gray-600 hover:text-brand">
            Доставка
          </Link>
          <Link href="/page/payment-2" className="text-gray-600 hover:text-brand">
            Оплата
          </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
