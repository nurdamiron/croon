import type { Metadata } from 'next'
import Link from 'next/link'
import { getCategories } from '@/lib/data'
import Sidebar from '@/components/LazySidebar'
import { SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  title: { absolute: 'Наборы для школ и кружков робототехники | Alash Electronics' },
  description: 'Образовательные наборы для школ и кружков: LEGO Education, Arduino, Microbit. Оптовые поставки по Казахстану. Безналичный расчёт, все документы.',
  alternates: { canonical: '/dlya-shkol' },
  openGraph: {
    title: 'Наборы для школ и кружков робототехники | Alash Electronics',
    description: 'Оптовые поставки образовательных наборов для школ и STEM-центров Казахстана. LEGO Education, Arduino, Microbit, mBot. Все закупочные документы.',
    url: '/dlya-shkol',
    locale: 'ru_KZ',
    images: [{ url: '/images/logo.png', width: 600, height: 300, alt: 'Наборы для школ — Alash Electronics' }],
  },
}

const faqItems = [
  {
    q: 'Работаете ли вы по безналичному расчёту и предоставляете ли документы для школ?',
    a: 'Да. Alash Electronics работает с юридическими лицами — школами, STEM-центрами, акиматами, частными учебными организациями. Выставляем счёт-фактуру, предоставляем накладную и акт выполненных работ. ИП на упрощёнке, НДС не облагается. Для государственных закупок готовим полный комплект документов под процедуру ГЦВП.',
  },
  {
    q: 'Есть ли скидки при оптовой закупке для школы?',
    a: 'Да, действует накопительная система скидок: от 5 комплектов — скидка 5%, от 10 — 10%, от 20 — 15%. Также рассматриваем индивидуальные условия для крупных государственных заказов. Запросите коммерческое предложение через форму на этой странице или напишите на WhatsApp: +7 (700) 900-17-90.',
  },
  {
    q: 'Какие наборы подходят для уроков информатики и технологии в школе?',
    a: 'Для уроков информатики и технологии рекомендуем: BBC Micro:bit (программирование с 5 класса, визуальный блочный MakeCode и Python), Arduino Starter Kit (7–11 класс, C++, практические проекты), mBot Makeblock (5–8 класс, Scratch + программирование роботов). Все платформы имеют готовые поурочные планы и методические материалы.',
  },
  {
    q: 'Совместимы ли ваши наборы с программой WRO и олимпиадами по робототехнике?',
    a: 'LEGO Education SPIKE Prime — официальная платформа WRO (World Robot Olympiad) и FLL (FIRST LEGO League). Наборы Qurastyr и наши авторские наборы амперPRO совместимы с форматом олимпиад RoboFest Казахстан. Arduino наборы используются на олимпиадах NIS и в кружках при Дворцах творчества.',
  },
  {
    q: 'Как долго доставляется оптовый заказ по Казахстану?',
    a: 'Стандартные сроки: Алматы — 1–2 рабочих дня (курьер), другие города Казахстана — 3–7 рабочих дней (inDrive или СДЭК). Для крупных заказов (20+ комплектов) согласовываем индивидуальный срок и возможность частичной отгрузки. При срочной потребности к учебному году рекомендуем оформить заказ минимум за 2 недели.',
  },
  {
    q: 'Есть ли техническая поддержка после покупки наборов для кружков?',
    a: 'Да. При покупке наборов для кружков и классов предоставляем: доступ к методическому материалу в электронном виде, онлайн-консультацию педагога в течение месяца после покупки (Telegram/WhatsApp), ссылки на видеоуроки и примеры проектов на русском языке. По запросу организуем выездной мастер-класс в Алматы.',
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
    { '@type': 'ListItem', position: 2, name: 'Для школ и кружков', item: `${SITE_URL}/dlya-shkol` },
  ],
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Alash Electronics',
  url: SITE_URL,
  telephone: '+77009001790',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'ул. Кыз Жибек, 104/1',
    addressLocality: 'Алматы',
    addressCountry: 'KZ',
  },
  areaServed: 'KZ',
}

export default async function DlyaSkolPage() {
  const categories = await getCategories()

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <Sidebar categories={categories} />

      <main className="flex-1 min-w-0">
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
          <Link href="/" className="hover:text-brand">Главная</Link>
          <span>/</span>
          <span className="text-gray-800">Для школ и кружков</span>
        </nav>

        <h1 className="text-2xl font-bold mb-2">Наборы для школ, кружков и STEM-центров</h1>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          Alash Electronics — поставщик образовательных наборов по робототехнике и электронике для школ и учебных организаций Казахстана.
          Работаем с государственными и частными школами, STEM-центрами, акиматами, Дворцами творчества и кружками робототехники.
          Оптовые поставки, безналичный расчёт, полный пакет документов.
        </p>

        {/* CTA block */}
        <div className="bg-brand/5 border border-brand/20 rounded-lg p-5 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Запросить коммерческое предложение</h2>
          <p className="text-sm text-gray-600 mb-4">
            Опишите вашу потребность: количество учащихся, класс или возраст, тип занятий (кружок, урок информатики, STEM-лаборатория).
            Подберём оптимальный комплект и пришлём КП с актуальными ценами.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/page/feedback"
              className="inline-block bg-brand hover:bg-brand-hover text-white text-sm font-medium px-5 py-2.5 rounded-md transition-colors"
            >
              Запросить КП
            </Link>
            <a
              href="https://wa.me/77009001790?text=Здравствуйте!%20Хочу%20запросить%20КП%20для%20школы%20на%20наборы%20робототехники."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-gray-300 hover:border-brand text-gray-700 hover:text-brand text-sm font-medium px-5 py-2.5 rounded-md transition-colors"
            >
              WhatsApp: +7 (700) 900-17-90
            </a>
          </div>
        </div>

        {/* Main article */}
        <article className="prose prose-sm max-w-none text-gray-700 space-y-5">

          <h2 className="text-xl font-bold text-gray-900 not-prose">Почему школы Казахстана выбирают Alash Electronics</h2>

          <p>
            Alash Electronics работает в Алматы с 2019 года и специализируется на поставках образовательного оборудования
            для кружков робототехники, STEM-лабораторий и уроков технологии. За это время мы выполнили поставки в
            более чем 40 школ и учебных центров Казахстана — в Алматы, Нур-Султане, Шымкенте, Актау и других городах.
          </p>
          <p>
            Мы не просто продаём наборы — мы помогаем выстроить учебный процесс: подбираем комплекты под конкретную
            программу и возраст, обеспечиваем методической поддержкой, консультируем педагогов при освоении платформ.
            Все наборы в наличии на складе в Алматы — заказы комплектуются и отправляются в день оформления.
          </p>

          <h2 className="text-xl font-bold text-gray-900 not-prose">Ассортимент для образовательных организаций</h2>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">LEGO Education SPIKE Prime — для WRO и FLL</h3>
          <p>
            <strong>LEGO Education SPIKE Prime</strong> — флагманская образовательная платформа LEGO для учащихся 5–9 классов.
            Поддерживает три уровня программирования: Scratch-подобный Word Blocks, Python и C-подобный.
            Поставляется с полным набором поурочных планов (Lesson Plans) на английском и русском языках.
          </p>
          <p>
            <strong>Базовый набор SPIKE Prime (45678)</strong> — 523 элемента, 6 умных моторов, 4 сенсора (цвет, расстояние, сила, гироскоп),
            хаб с Bluetooth. Подходит для одного ученика или пары. Цена: от 290 000 ₸.
          </p>
          <p>
            <strong>Ресурсный набор SPIKE Prime (45680)</strong> — дополнительные детали для расширения возможностей базового набора.
            Обязателен при участии в соревнованиях WRO. Цена: от 90 000 ₸.
          </p>
          <p>
            SPIKE Prime является официальной платформой <strong>World Robot Olympiad (WRO)</strong> и <strong>FIRST LEGO League (FLL)</strong>.
            При закупке комплектов класса (10–15 пар) предоставляем скидку и помогаем зарегистрироваться на соревнования.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">BBC Micro:bit — программирование с 5 класса</h3>
          <p>
            <strong>BBC Micro:bit</strong> — самый доступный способ начать изучение программирования в школе.
            Британский образовательный микроконтроллер используется в школах Великобритании, Германии, Израиля и всё шире внедряется в казахстанских школах НИШ и в частных STEM-центрах.
          </p>
          <p>
            Программируется через браузер — не требует установки программ, работает на любом компьютере или планшете.
            Поддерживает три среды: MakeCode (визуальные блоки для 5–7 класса), JavaScript (8–9 класс), Python (10–11 класс).
            Встроены: 5×5 LED-матрица, акселерометр, компас, радиомодуль, Bluetooth и разъём для расширений.
          </p>
          <p>
            В Alash Electronics доступны комплекты для оснащения класса:
            <strong> ElecFreaks Базовый Microbit Kit</strong> (25 000 ₸ за комплект) — плата + USB + инструкция;
            <strong> Keyestudio Microbit Sensor Kit</strong> (54 000 ₸) — плата Microbit + 37 датчиков и модулей для полного курса.
            При заказе от 10 штук — скидка и методические материалы для педагога в подарок.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Arduino — основа технического образования</h3>
          <p>
            <strong>Arduino</strong> — международный стандарт для обучения электронике и программированию в средней и старшей школе.
            Открытая платформа с огромным сообществом, тысячами готовых проектов и инструкций.
          </p>
          <p>
            Для кружков рекомендуем наш <strong>Расширенный обучающий набор Arduino от Alash Electronics</strong> (25 000 ₸) —
            разработан специально для казахстанских учебных заведений. В комплекте: плата Arduino UNO R3,
            книга проектов на русском языке (200+ страниц), 30+ компонентов.
            Курс рассчитан на 24 занятия по 45 минут для учащихся 7–11 классов.
          </p>
          <p>
            Для продвинутых кружков и олимпиадной подготовки — <strong>Arduino AmperPRO</strong> (65 000 ₸):
            расширенный набор шилдов, продвинутые датчики, задания олимпиадного уровня.
            Совместим с форматом RoboFest Казахстан.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Makeblock mBot — робот для STEM-класса</h3>
          <p>
            <strong>mBot от Makeblock</strong> (50 000 ₸) — готовый учебный робот, собирающийся за 30 минут.
            Программируется в Scratch-подобной среде mBlock — дети 8–14 лет осваивают его с первого занятия.
            Совместим с деталями LEGO. Поддерживает режимы: управление со смартфона, следование по линии, объезд препятствий.
          </p>
          <p>
            mBot широко используется в STEM-классах школ Алматы — Haileybury Almaty, QSI, ряде школ НИШ.
            В Alash Electronics доступен в двух версиях: стандартный (Bluetooth) и mBot Pro (Bluetooth + Wi-Fi, поддержка Python).
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Raspberry Pi для старшеклассников и преподавателей ИКТ</h3>
          <p>
            <strong>Raspberry Pi</strong> — одноплатный мини-компьютер под управлением Linux.
            Используется в старших классах (10–11) и вузах для изучения Python, Linux и IoT.
            Ideal для курсов по искусственному интеллекту (TensorFlow Lite), компьютерному зрению (OpenCV) и серверному программированию.
          </p>
          <p>
            Alash Electronics предлагает <strong>Raspberry Pi 4 Model B</strong> (4 ГБ, 89 000 ₸) и
            <strong> Raspberry Pi 5 Model B</strong> (4 ГБ, 99 000 ₸; 8 ГБ, 119 000 ₸) в комплектации Starter Kit:
            плата + блок питания + корпус + SD-карта с Raspberry Pi OS.
          </p>

          <h2 className="text-xl font-bold text-gray-900 not-prose">Комплектация класса: что нужно для кружка на 10–15 учеников</h2>

          <div className="not-prose overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Платформа</th>
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Возраст</th>
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Кол-во (на 15 учеников)</th>
                  <th className="border border-gray-200 px-3 py-2 font-semibold">Стоимость комплекта</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr>
                  <td className="border border-gray-200 px-3 py-2">BBC Micro:bit базовый</td>
                  <td className="border border-gray-200 px-3 py-2">8–12 лет</td>
                  <td className="border border-gray-200 px-3 py-2">15 шт. (индивидуально)</td>
                  <td className="border border-gray-200 px-3 py-2">от 337 500 ₸</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2">mBot Makeblock</td>
                  <td className="border border-gray-200 px-3 py-2">8–14 лет</td>
                  <td className="border border-gray-200 px-3 py-2">8 шт. (попарно)</td>
                  <td className="border border-gray-200 px-3 py-2">от 360 000 ₸</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Arduino Starter (Alash)</td>
                  <td className="border border-gray-200 px-3 py-2">12–17 лет</td>
                  <td className="border border-gray-200 px-3 py-2">8 шт. (попарно)</td>
                  <td className="border border-gray-200 px-3 py-2">от 180 000 ₸</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2">LEGO SPIKE Prime</td>
                  <td className="border border-gray-200 px-3 py-2">11–16 лет</td>
                  <td className="border border-gray-200 px-3 py-2">8 шт. (попарно)</td>
                  <td className="border border-gray-200 px-3 py-2">от 2 320 000 ₸</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Raspberry Pi 4 Kit</td>
                  <td className="border border-gray-200 px-3 py-2">15–18 лет</td>
                  <td className="border border-gray-200 px-3 py-2">15 шт. (индивидуально)</td>
                  <td className="border border-gray-200 px-3 py-2">от 1 335 000 ₸</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 not-prose">
            * Цены указаны до скидки. При оптовом заказе действует скидка 5–15% в зависимости от объёма. Запросите актуальное КП.
          </p>

          <h2 className="text-xl font-bold text-gray-900 not-prose">Условия работы с образовательными организациями</h2>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Документы и оплата</h3>
          <p>
            Alash Electronics — официально зарегистрированное ИП в Казахстане. Работаем по безналичному расчёту:
            выставляем счёт на оплату, предоставляем все закрывающие документы — накладную, акт, счёт-фактуру.
            Для государственных школ, акиматов и STEM-центров, работающих через Государственный центр выплат (ГЦВП),
            готовим полный пакет документов под закупочную процедуру.
          </p>
          <p>
            НДС не облагается (ИП на упрощёнке). Оплата: банковский перевод, Kaspi.kz для юридических лиц.
            Возможна рассрочка для крупных заказов по договорённости.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Скидки и условия</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-700 not-prose">
            <li>От 5 комплектов одного вида — скидка 5%</li>
            <li>От 10 комплектов — скидка 10%</li>
            <li>От 20 комплектов — скидка 15%</li>
            <li>Эксклюзивные условия для государственных закупок — по запросу</li>
            <li>Приоритетная отгрузка для школ при наличии письма от организации</li>
            <li>Бесплатная доставка по Алматы при заказе от 150 000 ₸</li>
          </ul>

          <h3 className="text-lg font-semibold text-gray-900 not-prose">Методическая поддержка</h3>
          <p>
            При закупке наборов для кружков и классов предоставляем бесплатно:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 not-prose">
            <li>Электронные методические материалы и поурочные планы для каждой платформы</li>
            <li>Ссылки на видеокурсы и инструкции на русском языке</li>
            <li>Онлайн-консультацию технического специалиста в течение месяца после покупки</li>
            <li>Помощь с настройкой оборудования и установкой программного обеспечения</li>
          </ul>
          <p>
            По запросу организуем <strong>выездной мастер-класс</strong> для педагогов в Алматы — знакомство с платформой,
            первые проекты, ответы на вопросы. Стоимость — по договорённости.
          </p>

          <h2 className="text-xl font-bold text-gray-900 not-prose">Для каких организаций подходит наше предложение</h2>

          <p>Мы уже работаем и готовы работать с:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 not-prose">
            <li>Государственными и частными общеобразовательными школами</li>
            <li>Школами с STEM-классами и IT-лабораториями</li>
            <li>Назарбаев Интеллектуальными Школами (НИШ)</li>
            <li>Дворцами творчества, домами учащейся молодёжи (ДУМ)</li>
            <li>Кружками и секциями робототехники при акиматах</li>
            <li>Частными STEM-центрами и IT-школами</li>
            <li>Технологическими факультетами вузов и колледжей</li>
            <li>Детскими технопарками и Fablab-лабораториями</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 not-prose">Как оформить заявку</h2>

          <p>
            <strong>Шаг 1.</strong> Заполните форму обратной связи или напишите на WhatsApp/Telegram: +7 (700) 900-17-90.
            Укажите: название организации, количество учеников/комплектов, желаемую платформу и сроки.
          </p>
          <p>
            <strong>Шаг 2.</strong> Наш менеджер свяжется с вами в течение рабочего дня, уточнит детали
            и пришлёт коммерческое предложение с актуальными ценами и скидками.
          </p>
          <p>
            <strong>Шаг 3.</strong> После согласования выставляем счёт. Оплата — банковским переводом.
            После подтверждения оплаты отгружаем товар со склада в Алматы.
          </p>
          <p>
            <strong>Шаг 4.</strong> Доставка по Алматы — 1–2 рабочих дня (курьер).
            По всему Казахстану — 3–7 рабочих дней (inDrive, СДЭК или транспортной компанией по выбору заказчика).
            Самовывоз: ул. Кыз Жибек, 104/1, пн–сб 12:00–20:00.
          </p>

        </article>

        {/* CTA bottom */}
        <div className="mt-8 bg-gray-50 border rounded-lg p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Готовы сделать заказ или нужна консультация?</h2>
          <p className="text-sm text-gray-600 mb-4">
            Оставьте заявку — подберём набор под вашу программу и пришлём коммерческое предложение с ценами.
            Работаем с государственными и частными организациями. Все закупочные документы.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/page/feedback"
              className="inline-block bg-brand hover:bg-brand-hover text-white text-sm font-medium px-5 py-2.5 rounded-md transition-colors"
            >
              Запросить КП
            </Link>
            <Link
              href="/arduino-nabory"
              className="inline-block border border-gray-300 hover:border-brand text-gray-700 hover:text-brand text-sm font-medium px-5 py-2.5 rounded-md transition-colors"
            >
              Каталог наборов
            </Link>
            <Link
              href="/collection/gotovye-nabory-dlya-robototehniki"
              className="inline-block border border-gray-300 hover:border-brand text-gray-700 hover:text-brand text-sm font-medium px-5 py-2.5 rounded-md transition-colors"
            >
              Все наборы в каталоге
            </Link>
          </div>
        </div>

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
          <Link href="/arduino-nabory" className="text-brand hover:underline">Наборы Arduino и Raspberry Pi</Link>
          <Link href="/collection/gotovye-nabory-dlya-robototehniki" className="text-gray-600 hover:text-brand">Все наборы</Link>
          <Link href="/collection/gotovye-nabory-arduino" className="text-gray-600 hover:text-brand">Наборы Arduino</Link>
          <Link href="/page/delivery" className="text-gray-600 hover:text-brand">Доставка</Link>
          <Link href="/page/contacts" className="text-gray-600 hover:text-brand">Контакты</Link>
          <Link href="/page/feedback" className="text-gray-600 hover:text-brand">Обратная связь</Link>
          <Link href="/blogs/kits" className="text-gray-600 hover:text-brand">Блог о наборах</Link>
        </div>
      </main>
    </div>
  )
}
