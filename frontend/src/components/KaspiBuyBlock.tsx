// Блок «Купить на Kaspi.kz» на странице товара.
// Рендерится только когда товар реально есть в фиде Kaspi (см. getKaspiBuyData).
// Полная версия с дисклеймером и преимуществами Kaspi.

export default function KaspiBuyBlock({ url }: { url: string }) {
  return (
    <div className="my-8 mx-auto max-w-2xl rounded-2xl border-2 border-[#ff0000] bg-gradient-to-br from-[#fff5f5] to-white p-6 sm:p-8 shadow-[0_4px_20px_rgba(255,0,0,0.1)]">
      <div className="flex justify-center mb-4">
        <span className="bg-[#ff0000] text-white text-[11px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-full">
          Доступно на маркетплейсе
        </span>
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 text-center mb-5">
        Купить на Kaspi.kz
      </h2>

      <div className="text-center mb-6">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-[#ff0000] hover:bg-[#e60000] text-white text-base sm:text-lg font-semibold px-8 sm:px-10 py-4 rounded-xl shadow-[0_6px_20px_rgba(255,0,0,0.3)] transition-colors"
        >
          Открыть в приложении Kaspi.kz
        </a>
      </div>

      <div className="flex flex-wrap justify-around gap-3 mb-6">
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-green-500 text-lg leading-none">✓</span> Доставка до двери
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-green-500 text-lg leading-none">✓</span> Kaspi Red 0-0-12
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-green-500 text-lg leading-none">✓</span> Защита покупателя
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-orange-500 text-lg leading-none">⚡</span> Kaspi Экспресс
        </span>
      </div>

      <div className="rounded-lg border-l-4 border-[#ff0000] bg-gray-50 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#ff0000] text-white text-sm font-bold shrink-0">
            i
          </span>
          <span className="font-semibold text-gray-800 text-base">Удобные варианты покупки</span>
        </div>
        <div className="text-sm text-gray-600 leading-relaxed pl-[34px]">
          <strong>Kaspi.kz — альтернативный способ приобретения</strong> этого товара с дополнительными преимуществами:
          <ul className="mt-2.5 space-y-1.5 list-none">
            <li><strong>🚚 Kaspi Экспресс в Алматы</strong> — получите заказ уже сегодня или завтра</li>
            <li><strong>📦 Доставка по всему Казахстану</strong> — курьером до вашей двери</li>
            <li><strong>💳 Рассрочка Kaspi Red</strong> — оплата частями 0-0-12 без переплат</li>
            <li><strong>🛡️ Полная защита покупки</strong> — гарантия возврата от Kaspi</li>
            <li><strong>⭐ Отзывы покупателей</strong> — читайте мнения других клиентов</li>
          </ul>
          <p className="mt-3 italic">
            💡 Для жителей Алматы: воспользуйтесь услугой Kaspi Экспресс для максимально быстрой доставки в день заказа!
          </p>
        </div>
      </div>
    </div>
  )
}
