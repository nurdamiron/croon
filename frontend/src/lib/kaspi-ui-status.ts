// UI-статусы Kaspi-заказов: показываем как в самом Kaspi (Упаковка / Передача /
// Выдан / Отменён / Возврат), а не один наш «Принят». Различие «Упаковка» vs
// «Передача» — по полю raw.assembled (приходит от Kaspi API):
//   ACCEPTED_BY_MERCHANT + assembled=false → Упаковка
//   ACCEPTED_BY_MERCHANT + assembled=true  → Передача (в курьерскую/самовывоз)
//
// На бронь это не влияет: reservedStock держится по сырому status=ACCEPTED_BY_MERCHANT,
// что покрывает обе фазы — как и было.

export type KaspiUiStatus =
  | 'OPLACHEN'   // Оплачен — APPROVED_BY_BANK
  | 'UPAKOVKA'   // Упаковка — ACCEPTED_BY_MERCHANT + assembled=false
  | 'PEREDACHA'  // Передача — ACCEPTED_BY_MERCHANT + assembled=true
  | 'VYDAN'      // Выдан — COMPLETED
  | 'OTMENEN'    // Отменён — CANCELLED / CANCELLING
  | 'VOZVRAT'    // Возврат — KASPI_DELIVERY_RETURN_REQUESTED / RETURN_ACCEPTED_BY_MERCHANT / RETURNED

export const KASPI_UI_LABELS: Record<KaspiUiStatus, string> = {
  OPLACHEN:  'Оплачен',
  UPAKOVKA:  'Упаковка',
  PEREDACHA: 'Передача',
  VYDAN:     'Выдан',
  OTMENEN:   'Отменён',
  VOZVRAT:   'Возврат',
}

export const KASPI_UI_COLORS: Record<KaspiUiStatus, string> = {
  OPLACHEN:  'bg-blue-50 text-blue-700 border-blue-200',
  UPAKOVKA:  'bg-amber-50 text-amber-700 border-amber-200',
  PEREDACHA: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  VYDAN:     'bg-green-50 text-green-700 border-green-200',
  OTMENEN:   'bg-red-50 text-red-700 border-red-200',
  VOZVRAT:   'bg-gray-100 text-gray-600 border-gray-200',
}

// Порядок отображения в фильтрах/счётчиках
export const KASPI_UI_ORDER: KaspiUiStatus[] = [
  'OPLACHEN', 'UPAKOVKA', 'PEREDACHA', 'VYDAN', 'OTMENEN', 'VOZVRAT',
]

function isAssembled(raw: unknown): boolean {
  return !!(raw && typeof raw === 'object' && (raw as Record<string, unknown>).assembled === true)
}

// Из сырого заказа (status + raw) получаем UI-статус. Если статус не из
// известного множества — возвращаем null, чтобы он не попал в сводку.
export function kaspiUiStatus(order: { status: string; raw?: unknown }): KaspiUiStatus | null {
  switch (order.status) {
    case 'APPROVED_BY_BANK':
      return 'OPLACHEN'
    case 'ACCEPTED_BY_MERCHANT':
      return isAssembled(order.raw) ? 'PEREDACHA' : 'UPAKOVKA'
    case 'COMPLETED':
      return 'VYDAN'
    case 'CANCELLED':
    case 'CANCELLING':
      return 'OTMENEN'
    case 'KASPI_DELIVERY_RETURN_REQUESTED':
    case 'RETURN_ACCEPTED_BY_MERCHANT':
    case 'RETURNED':
      return 'VOZVRAT'
    default:
      return null
  }
}

// Обратный маппинг: UI-статус → условие prisma where. Возвращает фрагмент,
// который добавляется к where через AND. Для UPAKOVKA/PEREDACHA дополнительно
// фильтрует по raw.assembled через JSON path (Postgres jsonb).
export function kaspiUiStatusToWhere(ui: KaspiUiStatus | string): Record<string, unknown> {
  switch (ui) {
    case 'OPLACHEN':
      return { status: 'APPROVED_BY_BANK' }
    case 'UPAKOVKA':
      return {
        status: 'ACCEPTED_BY_MERCHANT',
        NOT: [{ raw: { path: ['assembled'], equals: true } }],
      }
    case 'PEREDACHA':
      return {
        status: 'ACCEPTED_BY_MERCHANT',
        raw: { path: ['assembled'], equals: true },
      }
    case 'VYDAN':
      return { status: 'COMPLETED' }
    case 'OTMENEN':
      return { status: { in: ['CANCELLED', 'CANCELLING'] } }
    case 'VOZVRAT':
      return { status: { in: ['KASPI_DELIVERY_RETURN_REQUESTED', 'RETURN_ACCEPTED_BY_MERCHANT', 'RETURNED'] } }
    default:
      return {}
  }
}
