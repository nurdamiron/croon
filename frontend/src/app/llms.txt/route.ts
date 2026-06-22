export async function GET() {
  const content = `# Alash Electronics

> Интернет-магазин электронных компонентов в Казахстане. Продаём Arduino, Raspberry Pi, ESP32, датчики, модули, готовые наборы для робототехники и электроники. Работаем с 2019 года. Доставка по всему Казахстану. Телефон: +7(700) 900-17-90. Режим работы: 12:00–20:00.

## Основные разделы

- [Главная](https://alash-electronics.kz/)
- [Все товары](https://alash-electronics.kz/collection/all)
- [Готовые наборы для робототехники](https://alash-electronics.kz/collection/gotovye-nabory-dlya-robototehniki)
- [Arduino платы](https://alash-electronics.kz/collection/arduino)
- [Raspberry Pi](https://alash-electronics.kz/collection/raspberry)
- [ESP32 / ESP8266](https://alash-electronics.kz/collection/esp32-esp8266)
- [Датчики](https://alash-electronics.kz/collection/datchiki)
- [Аккумуляторы и батареи](https://alash-electronics.kz/collection/akkumulyatory-i-batarei)
- [Карта сайта](https://alash-electronics.kz/karta-sayta)

## Информация

- [Доставка](https://alash-electronics.kz/page/delivery)
- [Оплата](https://alash-electronics.kz/page/payment)
- [Условия оплаты](https://alash-electronics.kz/page/payment-2)
- [Контакты](https://alash-electronics.kz/page/contacts)
- [О компании](https://alash-electronics.kz/page/about-us)
- [Обратная связь](https://alash-electronics.kz/page/feedback)
- [AlashEd — товары для государственных закупок](https://alash-electronics.kz/page/alashed)
- [Оферта и конфиденциальность](https://alash-electronics.kz/page/oferta)
- [Wiki / база знаний](https://wiki.alashed.kz/)

## Optional

- [Sitemap XML](https://alash-electronics.kz/sitemap.xml)
- [Robots.txt](https://alash-electronics.kz/robots.txt)
`

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
