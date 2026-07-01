import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import ProductCard from '@/components/ProductCard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [popular, categories] = await Promise.all([
    prisma.product.findMany({
      where: { inStock: true, archived: false, images: { some: {} } },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: 16,
    }),
    prisma.category.findMany({
      where: { isHidden: false, parentId: { not: null } },
      select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
      take: 20,
    }),
  ])

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand/5 to-brand/10 rounded-2xl p-8 mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
          Электронные компоненты в Казахстане
        </h1>
        <p className="text-gray-600 text-lg mb-6 max-w-2xl">
          Arduino, ESP32, Raspberry Pi, датчики, модули и многое другое. Доставка по Костанаю и всему Казахстану.
        </p>
        <div className="flex gap-3">
          <Link href="/collection/all" className="bg-brand text-white px-6 py-2.5 rounded-lg hover:bg-brand-hover transition font-medium">
            Каталог
          </Link>
          <Link href="/favorites" className="bg-white text-brand border border-brand px-6 py-2.5 rounded-lg hover:bg-brand/5 transition font-medium">
            Избранное
          </Link>
        </div>
      </section>

      {/* Популярные товары */}
      {popular.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Популярные товары</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {popular.map((p) => (
              <ProductCard
                key={p.id}
                id={p.id}
                name={p.name}
                slug={p.slug}
                price={p.price}
                oldPrice={p.oldPrice}
                images={p.images}
                inStock={p.inStock}
                badgeText={p.badgeText}
              />
            ))}
          </div>
        </section>
      )}

      {/* Категории */}
      {categories.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-6">Категории</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {categories.filter(c => c._count.products > 0).map((c) => (
              <Link
                key={c.id}
                href={`/collection/${c.slug}`}
                className="bg-white border rounded-xl p-4 hover:border-brand hover:shadow-sm transition"
              >
                <div className="font-medium text-gray-900">{c.name}</div>
                <div className="text-sm text-gray-500">{c._count.products} шт</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {popular.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Товары загружаются...</p>
        </div>
      )}
    </div>
  )
}
