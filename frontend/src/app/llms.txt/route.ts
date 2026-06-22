export async function GET() {
  const content = `# ИП КРУН

> Интернет-магазин электронных компонентов в Казахстане. Продаём Arduino, Raspberry Pi, ESP32, датчики, модули, готовые наборы для робототехники и электроники. Работаем с 2019 года. Доставка по всему Казахстану. Телефон: +7(700) 900-17-90. Режим работы: 12:00–20:00.

## Основные разделы

- [Главная](https://croon.kz/)
- [Все товары](https://croon.kz/collection/all)
- [Готовые наборы для робототехники](https://croon.kz/collection/gotovye-nabory-dlya-robototehniki)
- [Arduino платы](https://croon.kz/collection/arduino)
- [Raspberry Pi](https://croon.kz/collection/raspberry)
- [ESP32 / ESP8266](https://croon.kz/collection/esp32-esp8266)
- [Датчики](https://croon.kz/collection/datchiki)
- [Аккумуляторы и батареи](https://croon.kz/collection/akkumulyatory-i-batarei)
- [Карта сайта](https://croon.kz/karta-sayta)

## Информация

- [Доставка](https://croon.kz/page/delivery)
- [Оплата](https://croon.kz/page/payment)
- [Условия оплаты](https://croon.kz/page/payment-2)
- [Контакты](https://croon.kz/page/contacts)
- [О компании](https://croon.kz/page/about-us)
- [Обратная связь](https://croon.kz/page/feedback)
- [Государственные закупки — товары для государственных учреждений](https://croon.kz/page/alashed)
- [Оферта и конфиденциальность](https://croon.kz/page/oferta)
- [Wiki / база знаний](https://wiki.croon.kz/)

## Optional

- [Sitemap XML](https://croon.kz/sitemap.xml)
- [Robots.txt](https://croon.kz/robots.txt)
`

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
