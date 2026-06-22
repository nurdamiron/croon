import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getBlogPostsByBlog, getCategories } from '@/lib/data'
import Link from 'next/link'
import Sidebar from '@/components/LazySidebar'
import { cleanDescription, SITE_URL } from '@/lib/seo'

interface Props {
  params: { blog: string }
}

const BLOG_TITLES: Record<string, string> = {
  kits: 'Наборы и проекты',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const title = BLOG_TITLES[params.blog] ?? 'Блог'
  return {
    title,
    description: `Статьи и обзоры по теме «${title}» в интернет-магазине ИП КРУН.`,
    alternates: { canonical: `/blogs/${params.blog}` },
    openGraph: {
      title: `${title} — ИП КРУН`,
      description: `Статьи и обзоры по теме «${title}» в интернет-магазине ИП КРУН.`,
      url: `/blogs/${params.blog}`,
      locale: 'ru_KZ',
    },
  }
}

export default async function BlogIndexPage({ params }: Props) {
  const [posts, categories] = await Promise.all([
    getBlogPostsByBlog(params.blog),
    getCategories(),
  ])

  if (!posts || posts.length === 0) return notFound()

  const blogTitle = BLOG_TITLES[params.blog] ?? 'Блог'

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: blogTitle, item: `${SITE_URL}/blogs/${params.blog}` },
    ],
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Sidebar categories={categories} />
      <main className="flex-1 min-w-0">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:text-brand">Главная</Link>
          <span className="mx-1">/</span>
          <span className="text-gray-800">{blogTitle}</span>
        </nav>
        <h1 className="text-2xl font-bold mb-6">{blogTitle}</h1>
        <p className="text-gray-600 mb-6 leading-relaxed">
          {params.blog === 'kits'
            ? 'Обзоры готовых наборов для робототехники, Arduino-проекты и инструкции по сборке. Пошаговые руководства, схемы подключения и рекомендации по компонентам от интернет-магазина ИП КРУН.'
            : `Статьи и материалы по теме «${blogTitle}» — обзоры, инструкции и практические советы от ИП КРУН.`}
        </p>
        <div className="space-y-6">
          {posts.map(post => (
            <article key={post.slug} className="border-b pb-6 last:border-0">
              <h2 className="text-lg font-semibold mb-2">
                <Link href={`/blogs/${post.blogSlug}/${post.slug}`} className="hover:text-brand">
                  {post.title}
                </Link>
              </h2>
              <p className="text-gray-600 text-sm mb-3 line-clamp-3">
                {cleanDescription(post.content)}
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <time dateTime={post.createdAt.toISOString()}>
                  {post.createdAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </time>
                <Link href={`/blogs/${post.blogSlug}/${post.slug}`} className="text-brand hover:text-brand-hover font-medium">
                  Читать статью «{post.title.slice(0, 40)}{post.title.length > 40 ? '…' : ''}» →
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-600 leading-relaxed">
          Компоненты для проектов из статей можно заказать в каталоге. Доставка по Костанаю и Казахстану, самовывоз из магазина.
        </p>
        <div className="mt-8 pt-6 border-t flex flex-wrap gap-3 text-sm">
          <Link href="/collection/gotovye-nabory-dlya-robototehniki" className="text-brand hover:text-brand-hover font-medium">
            → Готовые наборы в каталоге
          </Link>
          <Link href="/collection/all" className="text-gray-600 hover:text-brand">Весь каталог</Link>
          <Link href="/page/delivery" className="text-gray-600 hover:text-brand">Доставка</Link>
        </div>
      </main>
    </div>
  )
}
