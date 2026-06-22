import type { Metadata } from 'next'
import Link from 'next/link'
import { getProductsByCategorySlug, getCategories } from '@/lib/data'
import ProductCard from '@/components/ProductCard'
import Sidebar from '@/components/LazySidebar'
import { SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  title: { absolute: 'Наборы Arduino в Казахстане — роботы, STEM | ИП КРУН' },
  description: 'Купить набор Arduino для начинающих и школьников: стартовые комплекты UNO R3, роботы 4WD, STEM-наборы. Доставка по Казахстану, самовывоз в Костанае от 15 000 ₸.',
  alternates: { canonical: '/arduino-nabory' },
  openGraph: {
    title: 'Наборы Arduino в Казахстане — роботы, STEM | ИП КРУН',
    description: 'Стартовые наборы Arduino UNO, роботы 4WD, Raspberry Pi, LEGO, STEM-комплекты для школ. Доставка по Казахстану.',
    url: '/arduino-nabory',
    locale: 'ru_KZ',
    images: [{ url: '/images/logo.png', width: 600, height: 300, alt: 'Наборы Arduino — ИП КРУН' }],
  },
}

const faqItems = [
  {
    q: 'Что входит в стартовый набор Arduino для начинающих?',
    a: 'Стартовый набор Arduino UNO R3 включает плату Arduino UNO R3, USB-кабель, макетную плату (breadboard) на 830 точек, датчик температуры и влажности DHT11, ультразвуковой датчик расстояния HC-SR04, набор резисторов (10 Ом – 10 кОм), светодиоды нескольких цветов, тактовые кнопки, потенциометры и провода Dupont мама-мама и мама-папа. Ряд наборов дополнительно включает серводвигатель SG90, ЖК-дисплей 1602 и ИК-пульт. Инструкция с пошаговыми проектами прилагается.',
  },
  {
    q: 'С какого возраста можно начинать работу с Arduino?',
    a: 'Arduino подходит детям от 10–12 лет при участии взрослого, с 14 лет — полностью самостоятельно. Специальные образовательные наборы (Microbit, LEGO Education SPIKE) разработаны для детей 8–18 лет и активно используются в школах Казахстана. Для самых маленьких (6–9 лет) больше подойдут визуальные среды программирования типа Scratch + BBC Micro:bit.',
  },
  {
    q: 'Нужно ли знать программирование, чтобы собрать набор?',
    a: 'Нет. Стартовые наборы Arduino содержат готовые примеры кода (скетчи) с подробными комментариями на русском языке. Вы просто копируете код в Arduino IDE и загружаете на плату нажатием одной кнопки. Язык программирования Arduino основан на C++, но первые проекты (мигающий светодиод, термометр, парктроник) делаются без глубокого знания языка — достаточно понимать логику: "если нажата кнопка — включи светодиод".',
  },
  {
    q: 'Чем отличается Arduino UNO от Arduino Mega и Nano?',
    a: 'Arduino UNO R3 — стандарт для начинающих: 14 цифровых пинов, 6 аналоговых, 32 КБ памяти, питание от USB или 7–12 В. Arduino Mega 2560 нужна для сложных проектов: 54 цифровых пина, 16 аналоговых, 256 КБ памяти — идеальна для 3D-принтеров и роботов с множеством датчиков. Arduino Nano — компактная версия UNO для встроенных проектов, где важен размер: умные часы, мини-роботы, носимые устройства.',
  },
  {
    q: 'Какой набор выбрать для кружка робототехники в школе?',
    a: 'Для начального уровня (5–7 класс) — наборы Arduino Starter Kit или Microbit Базовый комплект. Для среднего уровня (8–9 класс) — роботы 4WD Smart Car, Keyestudio KEYBOT или mBot от Makeblock. Для продвинутого (10–11 класс, олимпиады) — LEGO Education SPIKE Prime, набор Qurastyr или AmperPRO с расширенной программой. ИП КРУН работает с образовательными организациями и предоставляет скидки при оптовых закупках.',
  },
  {
    q: 'Сколько стоит набор Arduino в Казахстане и как его купить?',
    a: 'Базовые стартовые наборы Arduino в ИП КРУН стоят от 12 000 до 35 000 ₸. Продвинутые наборы (AmperPRO, Qurastyr, Smart Car) — от 35 000 до 110 000 ₸. Raspberry Pi Starter Kit — 89 000–119 000 ₸. LEGO Education — от 150 000 ₸. Заказ онлайн на croon.kz, доставка Яндекс Курьером по Костанаю за 1–2 дня, по Казахстану через inDrive за 2–5 дней. Самовывоз: Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9, пн–сб 12:00–20:00.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Наборы Arduino и Raspberry Pi', item: `${SITE_URL}/arduino-nabory` },
  ],
}

export default async function ArduinoNaboryPage() {
  const [products, categories] = await Promise.all([
    getProductsByCategorySlug('gotovye-nabory-dlya-robototehniki', 24),
    getCategories(),
  ])

  const itemListJsonLd = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Наборы Arduino и Raspberry Pi',
    url: `${SITE_URL}/arduino-nabory`,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 12).map((p: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/product/${p.slug}`,
      name: p.name,
    })),
  } : null

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />}
      <Sidebar categories={categories} currentSlug="gotovye-nabory-dlya-robototehniki" />

      <main className="flex-1 min-w-0">
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
          <Link href="/" className="hover:text-brand">Главная</Link>
          <span>/</span>
          <span className="text-gray-800">Наборы Arduino и Raspberry Pi</span>
        </nav>

        <h1 className="text-2xl font-bold mb-2">Наборы Arduino купить в Казахстане</h1>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          54 готовых набора в наличии: стартовые комплекты Arduino UNO для начинающих, роботы-машинки 4WD,
          Raspberry Pi Starter Kit, LEGO Education SPIKE Prime, Microbit и STEM-наборы для школ и кружков.
          Доставка по всему Казахстану. Самовывоз в Костанай — Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9.
        </p>

        {/* Products */}
        <h2 className="text-lg font-semibold mb-4">Готовые наборы в наличии</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          {products.map((p: any) => (
            <ProductCard key={p.id} id={p.id} name={p.name} slug={p.slug}
              price={p.price} oldPrice={p.oldPrice} images={p.images} inStock={p.inStock} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mb-10 text-sm">
          <Link href="/collection/gotovye-nabory-dlya-robototehniki" className="text-brand font-medium hover:underline">→ Все наборы в каталоге</Link>
          <Link href="/collection/gotovye-nabory-arduino" className="text-gray-600 hover:text-brand">Наборы Arduino</Link>
          <Link href="/dlya-shkol" className="text-gray-600 hover:text-brand">Для школ и кружков</Link>
          <Link href="/blogs/kits" className="text-gray-600 hover:text-brand">Блог — инструкции и обзоры</Link>
        </div>

        {/* Buying guide */}
        <article className="prose prose-sm max-w-none text-gray-700 space-y-5 border-t pt-8">

          <h2 className="text-xl font-bold text-gray-900 not-prose">Как выбрать набор Arduino: полное руководство</h2>

          <p>
            <strong>Ардуино набор</strong> — это лучший способ начать изучать электронику и программирование.
            В одной коробке уже есть всё необходимое: микроконтроллер, датчики, провода и пошаговые инструкции.
            Не нужно разбираться, что именно купить отдельно — просто открываете набор и начинаете собирать проекты.
          </p>

          <p>
            В ИП КРУН — крупнейшем интернет-магазине электронных компонентов в Казахстане — доступно более 50 наборов:
            от базовых стартовых комплектов за 12 000 ₸ до профессиональных образовательных платформ LEGO Mindstorms за 460 000 ₸.
            Ниже — подробный гид, который поможет выбрать подходящий.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Стартовые наборы Arduino UNO — для абсолютных новичков</h3>

          <p>
            Если вы или ваш ребёнок никогда раньше не работали с электроникой — начните с <strong>Arduino Starter Kit</strong>.
            Три варианта в ИП КРУН (красный, зелёный, синий) содержат плату Arduino UNO R3, макетную плату, набор датчиков и инструкцию.
            Стоимость — от 15 000 до 25 000 ₸.
          </p>
          <p>
            С такого набора можно собрать 15–20 проектов, не покупая ничего дополнительно:
            мигающий светодиод, термометр на DHT11, дисплей 1602 с показаниями температуры, ультразвуковой парктроник,
            управление серводвигателем через потенциометр, сигнализация с датчиком движения.
            Каждый проект занимает 30–60 минут и не требует знания программирования: код уже написан, остаётся загрузить и наблюдать результат.
          </p>
          <p>
            Для тех, кто хочет больше: <strong>Расширенный обучающий набор Arduino от ИП КРУН</strong> (25 000 ₸)
            идёт с книгой проектов на 200+ страниц на русском языке. Это наш собственный набор, разработанный специально для казахстанских покупателей.
            <strong>Набор Arduino AmperPRO</strong> (65 000 ₸) — профессиональный уровень с расширенным набором шилдов и модулей для серьёзных проектов.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Роботы и машинки на Arduino — учимся строить и программировать</h3>

          <p>
            Роботы-машинки — самый популярный тип наборов среди детей 10–16 лет.
            <strong>4WD Smart Car Kit</strong> — колёсный робот на четырёх моторах, управляемый через Bluetooth со смартфона.
            В комплект входят шасси, моторы, плата Arduino UNO, Bluetooth-модуль HC-05, датчик расстояния и инструкция по сборке.
            После сборки машинку можно управлять с телефона, а затем добавить автоматическое объезжание препятствий или следование по линии.
          </p>
          <p>
            Наш <strong>Croon Phobo Arduino 4WD BT Smart Car kit V2.0</strong> (35 000 ₸) — собственная разработка магазина.
            Набор протестирован в кружках робототехники Костанай и рассчитан на самостоятельную сборку за 3–4 часа.
            Для продвинутых: <strong>ESP32 4WD Smart Car V3.0 Mecanum wheels</strong> (110 000 ₸) —
            колёса Mecanum позволяют двигаться в любом направлении, включая боком, управление через Wi-Fi.
          </p>
          <p>
            Среди наборов Keyestudio особого внимания заслуживают:
            <strong>KEYBOT Programmable Education Robot</strong> (55 000 ₸) — поддерживает графическое программирование Scratch для детей,
            <strong>4DOF Робот-манипулятор</strong> (42 000 ₸) — механическая рука с сервоприводами для изучения кинематики роботов,
            <strong>Mecanum Robot</strong> (21 000 ₸) — компактная платформа с омниколёсами.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Raspberry Pi Starter Kit — одноплатный компьютер для IoT и Python</h3>

          <p>
            <strong>Raspberry Pi</strong> — это не просто микроконтроллер, а полноценный одноплатный мини-компьютер с операционной системой Linux.
            Он подходит для более серьёзных задач: веб-сервер, медиацентр, система умного дома, распознавание изображений с камерой.
          </p>
          <p>
            В ИП КРУН доступны <strong>Raspberry Pi 4 Model B</strong> и <strong>Raspberry Pi 5 Model B</strong> в комплектации Starter Kit:
            плата + блок питания + корпус + SD-карта с предустановленной системой. Версии 4 ГБ и 8 ГБ ОЗУ — от 89 000 до 119 000 ₸.
            Starter Kit позволяет начать работу сразу после покупки — не нужно искать совместимые аксессуары.
          </p>
          <p>
            Raspberry Pi идеален для изучения Python: язык используется как основной на всех курсах и в образовательных материалах.
            На базе Raspberry Pi строят умные зеркала, системы видеонаблюдения, автоматизацию теплиц (IoT GreenHouse) и ретро-игровые консоли.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">IoT и умный дом на Arduino и ESP32</h3>

          <p>
            Интернет вещей (IoT) — направление, где микроконтроллеры подключаются к интернету и управляются через смартфон или облако.
            Для IoT-проектов подходит <strong>ESP32</strong> (встроенный Wi-Fi и Bluetooth) или Arduino + Wi-Fi шилд.
          </p>
          <p>
            <strong>Keyestudio IOT Smart Home Kit ESP32</strong> (51 000 ₸) — готовый набор для сборки модели умного дома:
            управление освещением, шторами, вентиляцией через смартфон. Датчики движения, температуры, газа и дыма включены.
            <strong>Keyestudio Smart Farm IOT</strong> (50 000 ₸) — аналогичный набор для сельхоз-тематики:
            мониторинг теплицы, автоматический полив, контроль влажности почвы через облако.
          </p>
          <p>
            Если хотите собрать умную теплицу самостоятельно — читайте нашу статью
            "<Link href="/blogs/kits/iotgreenhouse" className="text-brand hover:underline">Умная теплица IoT GreenHouse — проект на Arduino</Link>"
            с реальной схемой подключения и примером кода.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">LEGO Education и Microbit — для школ и кружков</h3>

          <p>
            Для образовательных организаций, кружков робототехники и STEM-лабораторий существуют специальные учебные платформы.
            <strong>LEGO Education SPIKE Prime</strong> — современная платформа для школьников 5–9 классов:
            поддерживает языки Scratch и Python, включает детальные поурочные планы, совместима с программой WRO и FLL.
            Базовый набор 45678 (290 000 ₸) и ресурсный набор 45680 (90 000 ₸).
          </p>
          <p>
            <strong>BBC Micro:bit</strong> — британский образовательный микроконтроллер для детей от 8 лет.
            Программируется через браузер без установки программ, поддерживает MakeCode (визуальный) и Python.
            Базовый комплект ElecFreaks (25 000 ₸) и сенсорный модуль Keyestudio (54 000 ₸) без платы — для кружков,
            где платы уже есть.
          </p>
          <p>
            <strong>Makeblock mBot</strong> (50 000 ₸) — готовый колёсный робот с поддержкой Scratch, совместим с LEGO.
            Один из наиболее популярных наборов для STEM-классов в школах Костанай и других городов Казахстана.
          </p>
          <p>
            Для школ, STEM-центров и учебных заведений ИП КРУН предоставляет
            <Link href="/dlya-shkol" className="text-brand hover:underline"> специальные условия при оптовых закупках</Link>.
            Работаем по безналичному расчёту с ИП и юридическими лицами, предоставляем все необходимые документы.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Сравнение наборов по уровню и возрасту</h3>

          <div className="not-prose overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Уровень</th>
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Возраст</th>
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Рекомендуемый набор</th>
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Цена</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Начинающий</td>
                  <td className="border border-gray-200 px-3 py-2">10–14 лет</td>
                  <td className="border border-gray-200 px-3 py-2">Arduino Starter Kit (красный/зелёный/синий)</td>
                  <td className="border border-gray-200 px-3 py-2">15 000–25 000 ₸</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2">Начинающий+</td>
                  <td className="border border-gray-200 px-3 py-2">12–16 лет</td>
                  <td className="border border-gray-200 px-3 py-2">4WD Smart Car Kit, mBot Makeblock</td>
                  <td className="border border-gray-200 px-3 py-2">20 000–50 000 ₸</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Средний</td>
                  <td className="border border-gray-200 px-3 py-2">14–18 лет</td>
                  <td className="border border-gray-200 px-3 py-2">Qurastyr, Smart Home ESP32, Raspberry Pi 4</td>
                  <td className="border border-gray-200 px-3 py-2">48 000–99 000 ₸</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2">Продвинутый</td>
                  <td className="border border-gray-200 px-3 py-2">15+ / студенты</td>
                  <td className="border border-gray-200 px-3 py-2">AmperPRO, Raspberry Pi 5, SPIKE Prime</td>
                  <td className="border border-gray-200 px-3 py-2">65 000–290 000 ₸</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Школы / оптом</td>
                  <td className="border border-gray-200 px-3 py-2">5–11 класс</td>
                  <td className="border border-gray-200 px-3 py-2">Microbit, LEGO SPIKE, mBot (комплект класса)</td>
                  <td className="border border-gray-200 px-3 py-2">от 25 000 ₸/шт</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Что можно сделать с набором Arduino: проекты</h3>

          <p>
            Вот реальные проекты, которые учащиеся собирают на основе наборов из нашего магазина:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            <li><strong>Умная теплица</strong> — автоматический полив по датчику влажности почвы, контроль температуры и вентиляция</li>
            <li><strong>Метеостанция</strong> — датчик DHT22 + BMP180 + дисплей, передача данных на сервер через ESP8266</li>
            <li><strong>Робот-автомобиль</strong> — управление через Bluetooth, обход препятствий, следование по линии</li>
            <li><strong>Умная розетка</strong> — включение/выключение через Wi-Fi и Telegram-бот (ESP32 + реле)</li>
            <li><strong>Система контроля доступа</strong> — RFID-карта, сервопривод, зуммер и дисплей</li>
            <li><strong>Роборука</strong> — 4 сервопривода, управление джойстиком или через Bluetooth</li>
            <li><strong>Лазерная сигнализация</strong> — инфракрасный датчик, зуммер и SMS-оповещение</li>
            <li><strong>Дисплей-часы</strong> — модуль RTC DS3231, OLED-дисплей, кнопки настройки времени</li>
          </ul>
          <p>
            Все перечисленные проекты реализуемы на наборах из ассортимента ИП КРУН без дополнительных покупок.
            Подробные инструкции по некоторым из них — в нашем <Link href="/blogs/kits" className="text-brand hover:underline">блоге о наборах и проектах</Link>.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Как оформить заказ и получить набор</h3>

          <p>
            <strong>Онлайн:</strong> добавьте набор в корзину на croon.kz, укажите контактные данные и адрес доставки.
            После подтверждения заказа менеджер свяжется с вами в течение рабочего дня.
          </p>
          <p>
            <strong>Доставка по Костанаю</strong> — Яндекс Курьер, 1–2 рабочих дня. Стоимость рассчитывается при оформлении.
            <strong>Доставка по Казахстану</strong> — через inDrive, 2–5 рабочих дней. Бесплатная доставка при заказе от 150 000 ₸.
            <strong>Самовывоз:</strong> Костанай Г.А., Костанай, МИКРОРАЙОН 9, дом 7, кв/офис 9, пн–сб 12:00–20:00.
          </p>
          <p>
            <strong>Оплата</strong> — наличными или картой при получении, банковским переводом (для юридических лиц), Kaspi Pay.
            Телефон и WhatsApp: <a href="tel:+77009001790" className="text-brand hover:underline">+7 (700) 900-17-90</a>.
            Telegram: <a href="https://t.me/croon_kz" className="text-brand hover:underline" target="_blank" rel="noopener">@croon_kz</a>.
          </p>

        </article>

        {/* FAQ */}
        <section className="mt-10 border-t pt-8">
          <h2 className="text-xl font-bold mb-6">Часто задаваемые вопросы</h2>
          <div className="space-y-6">
            {faqItems.map((item, i) => (
              <div key={i}>
                <h3 className="font-semibold text-gray-800 mb-2">{item.q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom links */}
        <div className="mt-8 pt-6 border-t flex flex-wrap gap-3 text-sm">
          <Link href="/collection/gotovye-nabory-dlya-robototehniki" className="text-brand hover:underline">Все наборы</Link>
          <Link href="/collection/gotovye-nabory-arduino" className="text-gray-600 hover:text-brand">Наборы Arduino</Link>
          <Link href="/dlya-shkol" className="text-gray-600 hover:text-brand">Для школ</Link>
          <Link href="/blogs/kits" className="text-gray-600 hover:text-brand">Блог</Link>
          <Link href="/page/delivery" className="text-gray-600 hover:text-brand">Доставка</Link>
          <Link href="/page/contacts" className="text-gray-600 hover:text-brand">Контакты</Link>
        </div>
      </main>
    </div>
  )
}
