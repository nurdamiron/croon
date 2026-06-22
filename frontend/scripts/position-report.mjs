// Сводка по позициям после scan: где мы одни, где есть конкуренты, на каких местах.
// Берёт ТОЛЬКО свежеснятые метрики (lastDumpCheckAt не пустой). Запуск на проде:
//   node scripts/position-report.mjs
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const offers = await p.kaspiOffer.findMany({
  where: { active: true },
  select: {
    kaspiSku: true, kaspiName: true, priceTenge: true,
    competitorCount: true, ourPosition: true, rivalPrice: true, rivalName: true,
    firstPlacePrice: true, lastDumpCheckAt: true,
    product: { select: { name: true, costPrice: true } },
  },
})

const checked = offers.filter(o => o.lastDumpCheckAt)
const notChecked = offers.length - checked.length

// Категории
const alone = checked.filter(o => (o.competitorCount ?? 0) === 0)
const withComp = checked.filter(o => (o.competitorCount ?? 0) > 0)
const pos1 = withComp.filter(o => o.ourPosition === 1)
const pos2 = withComp.filter(o => o.ourPosition === 2)
const pos3 = withComp.filter(o => o.ourPosition === 3)
const pos4plus = withComp.filter(o => (o.ourPosition ?? 99) >= 4)
const noPos = withComp.filter(o => o.ourPosition == null) // конкуренты есть, но нас нет в выдаче (не в наличии/глубже 64)

const fmt = (o) => `${(o.kaspiName || o.product?.name || o.kaspiSku || '').slice(0, 38).padEnd(38)} наша ${String(o.priceTenge).padStart(7)}₸  конк ${o.competitorCount ?? 0}  ${o.ourPosition ? 'поз '+o.ourPosition : 'нас нет'}  ${o.rivalPrice ? 'рядом '+o.rivalPrice+'₸' : ''}`

console.log('=================== СВОДКА ПО ПОЗИЦИЯМ ===================')
console.log(`Всего активных офферов: ${offers.length}`)
console.log(`Снято в этом scan:      ${checked.length}`)
console.log(`Ещё не снято:           ${notChecked}`)
console.log('')
console.log(`⚪ МЫ ОДНИ (нет конкурентов):     ${alone.length}`)
console.log(`⚔  С КОНКУРЕНТАМИ:               ${withComp.length}`)
console.log(`     🥇 мы 1-е:                  ${pos1.length}`)
console.log(`     🥈 мы 2-е:                  ${pos2.length}`)
console.log(`     🥉 мы 3-е:                  ${pos3.length}`)
console.log(`     ⬇  мы 4+ :                  ${pos4plus.length}`)
console.log(`     ❓ нас нет в выдаче:        ${noPos.length}`)
console.log('')
console.log('--- ⬇ ГДЕ МЫ НЕ В ТОПЕ (4+ или нас нет), топ-30 по цене ---')
;[...pos4plus, ...noPos].sort((a,b)=>(b.priceTenge||0)-(a.priceTenge||0)).slice(0,30).forEach(o=>console.log('  '+fmt(o)))
console.log('')
console.log('--- 🥈 МЫ 2-е (можно дожать до 1-го), топ-20 ---')
pos2.sort((a,b)=>(b.priceTenge||0)-(a.priceTenge||0)).slice(0,20).forEach(o=>console.log('  '+fmt(o)))

process.exit(0)
