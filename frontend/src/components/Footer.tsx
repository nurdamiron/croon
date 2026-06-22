import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-white border-t mt-8">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {/* Column 1 - Каталог */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Каталог</h4>
            <ul className="space-y-0 text-sm">
              <li><Link href="/collection/all" className="block py-2 text-[#333] hover:text-brand">Все товары</Link></li>
              <li><Link href="/collection/datchiki" className="block py-2 text-[#333] hover:text-brand">Датчики</Link></li>
              <li><Link href="/collection/akkumulyatory-i-batarei" className="block py-2 text-[#333] hover:text-brand">Аккумуляторы и батареи</Link></li>
              <li><Link href="/collection/adaptery-razyomy-i-shteker" className="block py-2 text-[#333] hover:text-brand">Адаптеры и разъёмы</Link></li>
              <li><Link href="/collection/aksessuary" className="block py-2 text-[#333] hover:text-brand">Аксессуары</Link></li>
              <li><Link href="/collection/cnc-chpu-stanki" className="block py-2 text-[#333] hover:text-brand">CNC / ЧПУ станки</Link></li>
            </ul>
          </div>

          {/* Column 2 - Ещё категории + навигация */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Разделы</h4>
            <ul className="space-y-0 text-sm">
              <li><Link href="/collection/bms-platy" className="block py-2 text-[#333] hover:text-brand">BMS платы</Link></li>
              <li><Link href="/collection/avtotovary" className="block py-2 text-[#333] hover:text-brand">Автотовары</Link></li>
              <li><Link href="/collection/gotovye-nabory-dlya-robototehniki" className="block py-2 text-[#333] hover:text-brand">Готовые наборы</Link></li>
              <li><Link href="/arduino-nabory" className="block py-2 text-[#333] hover:text-brand">Наборы Arduino</Link></li>
              <li><Link href="/dlya-shkol" className="block py-2 text-[#333] hover:text-brand">Для школ и кружков</Link></li>
              <li><Link href="/page/delivery" className="block py-2 text-[#333] hover:text-brand">Доставка</Link></li>
              <li><Link href="/page/payment" className="block py-2 text-[#333] hover:text-brand">Способы оплаты</Link></li>
              <li><Link href="/page/payment-2" className="block py-2 text-[#333] hover:text-brand">Условия оплаты</Link></li>
              <li><Link href="/page/contacts" className="block py-2 text-[#333] hover:text-brand">Контакты</Link></li>
              <li><Link href="/page/about-us" className="block py-2 text-[#333] hover:text-brand">О компании</Link></li>
              <li><Link href="/page/feedback" className="block py-2 text-[#333] hover:text-brand">Обратная связь</Link></li>
            </ul>
          </div>

          {/* Column 3 - Info */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Информация</h4>
            <ul className="space-y-0 text-sm">
              <li><Link href="/" className="block py-2 text-[#333] hover:text-brand">Главная</Link></li>
              <li><Link href="/client_account/login" className="block py-2 text-[#333] hover:text-brand">Личный кабинет</Link></li>
              <li><Link href="/page/alashed" className="block py-2 text-[#333] hover:text-brand">AlashEd — Гос.закуп</Link></li>
              <li><a href="https://wiki.alashed.kz/" target="_blank" rel="noopener" className="block py-2 text-[#333] hover:text-brand">Wiki</a></li>
              <li><Link href="/blogs/kits" className="block py-2 text-[#333] hover:text-brand">Блог — Наборы и проекты</Link></li>
              <li><Link href="/page/oferta" className="block py-2 text-[#333] hover:text-brand">Оферта и конфиденциальность</Link></li>
              <li><Link href="/karta-sayta" className="block py-2 text-[#333] hover:text-brand">Карта сайта</Link></li>
              <li><Link href="/sitemap.xml" className="block py-2 text-[#333] hover:text-brand">Sitemap XML</Link></li>
            </ul>
          </div>

          {/* Column 4 - Contacts & Social */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Мы в соц. сетях</h4>
            <div className="flex gap-2 mb-4">
              <a href="https://t.me/alash_electronics" target="_blank" rel="noopener" aria-label="Telegram Alash Electronics" className="w-11 h-11 bg-brand rounded-full flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/></svg>
              </a>
              <a href="https://www.instagram.com/alash_engineer/" target="_blank" rel="noopener" aria-label="Instagram Alash Electronics" className="w-11 h-11 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
              <a href="https://wa.me/77009001790" target="_blank" rel="noopener" aria-label="WhatsApp Alash Electronics" className="w-11 h-11 bg-[#25D366] rounded-full flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12c2.09 0 4.047-.538 5.757-1.479L24 12c0-6.627-5.373-12-12-12zm.02 4c2.135 0 4.14.832 5.65 2.342A7.956 7.956 0 0120 12a7.974 7.974 0 01-7.98 7.98 7.98 7.98 0 01-3.814-.97L4 20l1.02-4.089A7.953 7.953 0 014 12.02C4 7.601 7.601 4 12.02 4zM9.094 7.953c-.161 0-.421.06-.642.3-.22.239-.842.822-.842 2.006s.862 2.325.983 2.486c.12.161 1.673 2.7 4.133 3.674 2.039.804 2.46.645 2.903.604.441-.04 1.424-.584 1.624-1.148.2-.564.2-1.047.14-1.148-.06-.1-.22-.16-.461-.28-.24-.12-1.424-.702-1.644-.782-.22-.08-.381-.12-.541.12-.16.24-.622.782-.762.942-.14.161-.28.181-.521.06-.24-.12-1.013-.373-1.93-1.19-.714-.634-1.196-1.417-1.336-1.657-.14-.24-.015-.37.105-.49.108-.107.24-.28.361-.42.12-.14.16-.24.24-.4.08-.161.04-.3-.02-.42-.06-.12-.541-1.306-.742-1.787-.194-.468-.392-.405-.541-.413z"/></svg>
              </a>
            </div>
            <a href="tel:+77009001790" className="text-[#333] font-medium text-base hover:text-brand block py-1">
              +7(700) 900-17-90
            </a>
            <span className="text-[#999] text-xs">интернет-магазин</span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <Link href="/" aria-label="Alash Electronics — Главная">
            <Image src="/images/logo.png" alt="Alash electronics" width={140} height={70} className="object-contain" />
          </Link>
          <p className="text-xs text-[#999]">
            Alash Electronics — электронные компоненты с 2019 года. &copy; 2020-2026 Любое использование контента без письменного разрешения запрещено.
          </p>
        </div>
      </div>
    </footer>
  )
}
