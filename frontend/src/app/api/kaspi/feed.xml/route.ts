import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getFlag, KASPI_FEED_ENABLED } from '@/lib/app-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MERCHANT_ID = process.env.KASPI_MERCHANT_ID || '30233309';

// Список cityId, по которым отдаётся цена. По умолчанию — крупнейшие
// города Казахстана (чтобы Kaspi не ругался «недоступен во всех городах»).
// Цена для всех одинаковая (берётся из KaspiOffer.priceTenge).
// Если нужны разные цены по городам — реализовать KaspiOffer.cityPrices[] позже.
// Коды городов согласно официальной таблице Kaspi:
// https://guide.kaspi.kz/partner/ru/shop/api/general/q3200
const DEFAULT_CITY_IDS = (process.env.KASPI_FEED_CITY_IDS || [
  '750000000', // Костанай
  '710000000', // Астана
  '511010000', // Шымкент
  '351010000', // Караганда
  '151010000', // Актобе
  '231010000', // Атырау
  '551010000', // Павлодар
  '391010000', // Костанай
  '431010000', // Кызылорда
  '271010000', // Уральск
  '471010000', // Актау
  '111010000', // Кокшетау
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function GET(request: NextRequest) {
  const expectedUser = process.env.KASPI_FEED_USER;
  const expectedPass = process.env.KASPI_FEED_PASS;
  if (expectedUser && expectedPass) {
    const auth = request.headers.get('authorization');
    const expected = 'Basic ' + Buffer.from(`${expectedUser}:${expectedPass}`).toString('base64');
    if (auth !== expected) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic' },
      });
    }
  }

  // АВАРИЙНЫЙ ТУМБЛЕР: если выключен — фид пустой (все товары исчезают с Kaspi).
  // Включение возвращает ровно те же active-офферы с текущим складом — ничего
  // не теряется (per-offer active/сток не трогаются).
  const feedEnabled = await getFlag(KASPI_FEED_ENABLED);

  const offers = feedEnabled ? await prisma.kaspiOffer.findMany({
    where: { active: true, product: { archived: false } }, // архивные товары не в фид
    include: {
      product: { select: { name: true, totalStock: true, reservedStock: true, inStock: true } },
    },
    orderBy: { createdAt: 'asc' },
  }) : [];

  // В KaspiOffer.kaspiSku мы храним kaspi product id из URL карточки
  // (например "118134700"), а Kaspi для фида ждёт merchant SKU из ACTIVE.xml
  // (например "113575988_388232165"). Нужно найти соответствие через
  // KaspiCatalogEntry.kaspiProductId.
  const offerKeys = offers.map(o => o.kaspiSku);
  const catalogEntries = await prisma.kaspiCatalogEntry.findMany({
    where: {
      OR: [
        { kaspiProductId: { in: offerKeys } },
        { kaspiSku: { in: offerKeys } },
      ],
    },
    select: { kaspiSku: true, kaspiProductId: true, storeId: true, cityId: true },
  });
  const merchantSkuByKey = new Map<string, string>();
  const storeByKey = new Map<string, { storeId: string; cityId: string }>();
  for (const e of catalogEntries) {
    // ключ может быть kaspiProductId или сам kaspiSku
    if (e.kaspiProductId) {
      merchantSkuByKey.set(e.kaspiProductId, e.kaspiSku);
      storeByKey.set(e.kaspiProductId, { storeId: e.storeId, cityId: e.cityId });
    }
    merchantSkuByKey.set(e.kaspiSku, e.kaspiSku);
    if (!storeByKey.has(e.kaspiSku)) storeByKey.set(e.kaspiSku, { storeId: e.storeId, cityId: e.cityId });
  }

  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // В фид отправляем офферы с именем: kaspiName (имена на Kaspi отличаются от сайта),
  // а если оно пустое — берём название товара Сайт (fallback). Так оффер с пустым
  // kaspiName больше НЕ выпадает из фида (Kaspi требует <model> непустым).
  // Бренд опционален — Kaspi сам принимает карточки без бренда (generic-товары, наборы).
  //
  // Дедуп по итоговому merchant SKU: несколько KaspiOffer могут указывать на одну
  // карточку Kaspi (например старый оффер сохранён под голым product-id "113363268",
  // а новый — под составным merchant SKU "113363268_053412517"). Из конфликтующих
  // активных офферов берём тот, чей kaspiSku СОВПАДАЕТ с merchant SKU (он «правильный»
  // и виден на админке); голый product-id-оффер — запасной. Так выключение оффера на
  // админке гарантированно убирает карточку из фида, без невидимых сирот-дублей.
  const offerName = (o: typeof offers[number]) => (o.kaspiName || o.product?.name || '').trim();
  const candidates = offers.filter((o) => offerName(o));
  const bestByMerchantSku = new Map<string, typeof candidates[number]>();
  for (const o of candidates) {
    const merchantSku = merchantSkuByKey.get(o.kaspiSku) || o.kaspiSku;
    const existing = bestByMerchantSku.get(merchantSku);
    if (!existing) { bestByMerchantSku.set(merchantSku, o); continue; }
    // приоритет офферу, чей kaspiSku == merchant SKU
    if (o.kaspiSku === merchantSku && existing.kaspiSku !== merchantSku) {
      bestByMerchantSku.set(merchantSku, o);
    }
  }
  const dedupedOffers = Array.from(bestByMerchantSku.values());

  const offerXml = dedupedOffers
    .map((o) => {
      // Подменяем kaspi product id на merchant SKU из каталога (если есть).
      // Без каталога Kaspi не свяжет оффер с карточкой — оставляем как есть для отладки.
      const merchantSku = merchantSkuByKey.get(o.kaspiSku) || o.kaspiSku;
      const storeInfo = storeByKey.get(o.kaspiSku);
      const storeId = storeInfo?.storeId || o.kaspiStoreId;
      const cityId = storeInfo?.cityId || o.cityId;

      // Доступный остаток = totalStock − reservedStock (бронь под Kaspi-заказы).
      // stockOverride, если задан вручную, имеет приоритет (полный контроль админа).
      const availStock = Math.max(0, o.product.totalStock - (o.product.reservedStock ?? 0));
      const stock = o.stockOverride != null ? Math.max(0, o.stockOverride) : availStock;
      const autoAvailable = stock > 0 && o.product.inStock;
      const available = o.availableOverride != null ? o.availableOverride : autoAvailable;
      const yn = available ? 'yes' : 'no';
      const preOrder = o.preOrder ?? 0;
      const name = esc(offerName(o)).slice(0, 250);
      const brandTag = o.kaspiBrand ? `<brand>${esc(o.kaspiBrand)}</brand>` : `<brand/>`;
      // Отдаём цену по каждому городу из DEFAULT_CITY_IDS (одна сумма для всех).
      // cityId оффера/каталога ставим первым в списке (на случай если cityId особый).
      const cityIds = [cityId, ...DEFAULT_CITY_IDS.filter(c => c !== cityId)];
      const cityPricesXml = cityIds.map(c => `                <cityprice cityId="${esc(c)}">${o.priceTenge}</cityprice>`).join('\n');
      return `        <offer sku="${esc(merchantSku)}">
            <model>${name}</model>
            ${brandTag}
            <availabilities>
                <availability available="${yn}" storeId="${esc(storeId)}" preOrder="${preOrder}" stockCount="${stock}"/>
            </availabilities>
            <cityprices>
${cityPricesXml}
            </cityprices>
        </offer>`;
    })
    .filter((x): x is string => x !== null)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kaspi_catalog xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://kaspi.kz/kaspishopping.xsd" date="${date}">
    <company>${MERCHANT_ID}</company>
    <merchantid>${MERCHANT_ID}</merchantid>
    <offers>
${offerXml}
    </offers>
</kaspi_catalog>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
