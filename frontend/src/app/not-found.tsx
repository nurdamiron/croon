import Link from 'next/link'
import Image from 'next/image'

export default function NotFound() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
      <Image
        src="/images/sheldon-404.png"
        alt="Sheldon Cooper — 404"
        width={1980}
        height={938}
        className="w-[90%] h-auto"
        priority
      />

      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <Link
          href="/"
          className="inline-block bg-brand text-white px-6 py-3 rounded-lg hover:bg-brand-hover transition-colors font-medium shadow-lg"
        >
          Вернуться в реальность
        </Link>
        <Link
          href="/collection/all"
          className="inline-block bg-white text-brand border-2 border-brand px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors font-medium shadow-lg"
        >
          Постучать к Пенни
        </Link>
      </div>
    </div>
  )
}
