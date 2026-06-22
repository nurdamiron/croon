// Разбивка многовариантных товаров на отдельные карточки (1 карточка = 1 товар).
//
// Для каждого товара с >1 вариантом:
//   - первый вариант ОСТАЁТСЯ в исходной карточке (она становится однвариантной),
//     имя дополняется «(SKU)» если SKU есть;
//   - каждый остальной вариант → НОВЫЙ Product (копия описания/категорий/картинок,
//     имя = «Имя (SKU)»), со своим единственным ProductVariant (тот же SKU/цена/...).
//
// Привязки Kaspi/Satu/Ba3ar идут по SKU варианта — SKU переезжает вместе с вариантом,
// поэтому связи сохраняются.
//
// БЕЗ флага --apply скрипт только печатает план (dry-run), ничего не меняет.
// Запуск:  node scripts/split-variants-to-products.js           (dry-run)
//          node scripts/split-variants-to-products.js --apply   (выполнить)

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')

function slugify(str) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y',
    'ь':'','э':'e','ю':'yu','я':'ya',
  }
  return String(str).toLowerCase().split('').map(c => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

async function uniqueSlug(base) {
  let slug = base || 'tovar'
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await prisma.product.findUnique({ where: { slug }, select: { id: true } })
    if (!exists) return slug
    slug = `${base}-${++n}`
  }
}

async function main() {
  console.log(APPLY ? '=== РЕЖИМ: ВЫПОЛНЕНИЕ (--apply) ===' : '=== РЕЖИМ: DRY-RUN (без изменений) ===')

  const multi = await prisma.$queryRawUnsafe(
    `SELECT "productId" FROM "ProductVariant" GROUP BY "productId" HAVING count(*) > 1`
  )
  const ids = multi.map(r => r.productId)

  let totalNewCards = 0
  let totalProductsTouched = 0

  for (const pid of ids) {
    const product = await prisma.product.findUnique({
      where: { id: pid },
      include: {
        variants: true,
        images: { orderBy: { sortOrder: 'asc' } },
        categories: { select: { id: true } },
      },
    })
    if (!product || product.variants.length <= 1) continue
    totalProductsTouched++

    const [firstVariant, ...rest] = product.variants

    // 1) Первый вариант остаётся в исходной карточке. Имя + (SKU), если есть.
    const firstName = firstVariant.sku ? `${product.name} (${firstVariant.sku})` : product.name
    console.log(`\n[${product.name}] вариантов: ${product.variants.length}`)
    console.log(`  ОСТАВИТЬ в карточке ${product.id}: «${firstName}» SKU=${firstVariant.sku ?? '—'} цена=${firstVariant.price} ост=${firstVariant.stock}`)

    if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: firstName,
          price: firstVariant.price,
          oldPrice: firstVariant.oldPrice,
          costPrice: firstVariant.costPrice ?? product.costPrice,
          weight: firstVariant.weight ?? product.weight,
          totalStock: firstVariant.stock,
          inStock: firstVariant.stock > 0 ? product.inStock : false,
          variantAttributes: [],
        },
      })
      // удалить лишние варианты из исходной карточки (оставить только первый)
      await prisma.productVariant.deleteMany({
        where: { productId: product.id, id: { not: firstVariant.id } },
      })
      await prisma.productVariant.update({
        where: { id: firstVariant.id },
        data: { attributes: {}, title: null },
      })
    }

    // 2) Остальные варианты → новые карточки.
    for (const v of rest) {
      const newName = v.sku ? `${product.name} (${v.sku})` : `${product.name}`
      totalNewCards++
      console.log(`  СОЗДАТЬ карточку: «${newName}» SKU=${v.sku ?? '—'} цена=${v.price} ост=${v.stock}`)

      if (APPLY) {
        const newId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const slug = await uniqueSlug(slugify(newName))
        await prisma.product.create({
          data: {
            id: newId,
            name: newName,
            slug,
            description: product.description,
            price: v.price,
            oldPrice: v.oldPrice,
            costPrice: v.costPrice ?? null,
            weight: v.weight ?? null,
            categoryId: product.categoryId,
            inStock: v.stock > 0,
            totalStock: v.stock,
            metaTitle: product.metaTitle,
            metaDescription: product.metaDescription,
            variantAttributes: [],
            ...(product.categories.length > 0 && {
              categories: { connect: product.categories.map(c => ({ id: c.id })) },
            }),
            ...(product.images.length > 0 && {
              images: { create: product.images.map((img, i) => ({ url: img.url, alt: newName, sortOrder: i })) },
            }),
            variants: {
              create: {
                id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                sku: v.sku,
                price: v.price,
                oldPrice: v.oldPrice,
                costPrice: v.costPrice ?? null,
                weight: v.weight ?? null,
                stock: v.stock,
                available: v.stock > 0,
                title: null,
                attributes: {},
              },
            },
          },
        })
      }
    }
  }

  console.log(`\n=== ИТОГО ===`)
  console.log(`Товаров затронуто: ${totalProductsTouched}`)
  console.log(`Новых карточек будет создано: ${totalNewCards}`)
  console.log(APPLY ? 'Изменения ПРИМЕНЕНЫ.' : 'Это DRY-RUN. Для выполнения добавьте флаг --apply.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
