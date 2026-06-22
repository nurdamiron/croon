// Синхронизация Product ↔ единственный тех-вариант по costPrice / weight / price.
// Модель «1 карточка = 1 товар»: эти поля должны совпадать на Product и на варианте.
// Рассинхрон ломает демпинг (floor читает Product.costPrice) и фильтры.
//
// Стратегия «брать непустое»: для каждого поля
//   - одно пусто (null/0), другое непусто → прописать непустое в ОБА;
//   - оба непустые но разные → КОНФЛИКТ, не трогаем, печатаем;
//   - оба пусты / равны → ничего.
//
// Запуск (dry-run по умолчанию):  node scripts/sync-product-variant-fields.js
// Применить:                      node scripts/sync-product-variant-fields.js --apply
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const FIELDS = ['costPrice', 'weight', 'price']
// price на Product NOT NULL (по схеме), на варианте — Float?. Для price «пусто» = 0.
const empty = (v) => v == null || v === 0

async function main() {
  const prods = await prisma.product.findMany({
    select: {
      id: true, name: true, costPrice: true, weight: true, price: true,
      variants: { select: { id: true, costPrice: true, weight: true, price: true } },
    },
  })

  let fixed = 0
  const conflicts = []
  const plan = [] // {id, name, changes:[{field, from..to}]}

  for (const p of prods) {
    if (p.variants.length !== 1) continue // только тех-вариант
    const v = p.variants[0]
    const prodData = {}
    const varData = {}
    const changes = []

    for (const f of FIELDS) {
      const pv = p[f], vv = v[f]
      const pe = empty(pv), ve = empty(vv)
      if (pe && ve) continue                  // оба пусты
      if (!pe && !ve) {
        if (pv !== vv) conflicts.push({ id: p.id, name: p.name, field: f, P: pv, V: vv })
        continue                              // оба непусты: равны → ок, разные → конфликт (не трогаем)
      }
      // одно пусто — берём непустое, пишем в оба
      const val = pe ? vv : pv
      if (pe) { prodData[f] = val; changes.push(`${f}: Product ${pv}→${val}`) }
      if (ve) { varData[f] = val;  changes.push(`${f}: variant ${vv}→${val}`) }
    }

    if (changes.length) {
      plan.push({ id: p.id, name: p.name, changes })
      if (APPLY) {
        if (Object.keys(prodData).length) await prisma.product.update({ where: { id: p.id }, data: prodData })
        if (Object.keys(varData).length)  await prisma.productVariant.update({ where: { id: v.id }, data: varData })
        fixed++
      }
    }
  }

  console.log(`Товаров к синхронизации: ${plan.length}`)
  console.log(`Конфликтов (оба непусты, разные — НЕ трогаем): ${conflicts.length}`)
  console.log('')
  console.log('=== ПЛАН (до 25) ===')
  plan.slice(0, 25).forEach(p => console.log(`  ${p.id} "${p.name.slice(0, 34)}" → ${p.changes.join(' | ')}`))
  if (conflicts.length) {
    console.log('\n=== КОНФЛИКТЫ (до 25, решай вручную) ===')
    conflicts.slice(0, 25).forEach(c => console.log(`  ${c.id} ${c.field}: Product=${c.P} variant=${c.V} "${c.name.slice(0, 30)}"`))
  }
  console.log('')
  console.log(APPLY ? `✅ ПРИМЕНЕНО: синхронизировано ${fixed} товаров` : '— DRY-RUN (ничего не изменено). Применить: --apply')
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
