'use client'

/**
 * Lazy-loaded sidebar — renders client-side only (ssr: false).
 *
 * Why: the Sidebar SSR-renders 167 category links (~15 KB of HTML).
 * This bloats the server HTML and tanks the text/HTML ratio (Semrush warning).
 * With ssr:false, the 15 KB disappears from the crawled HTML; Semrush sees
 * clean product/category page content instead of navigation markup.
 *
 * Trade-off: Google executes JS and still crawls sidebar links. Category
 * links are also in karta-sayta and sitemap, so crawl depth is unaffected.
 */

import dynamic from 'next/dynamic'

const Sidebar = dynamic(() => import('./Sidebar'), {
  ssr: false,
  loading: () => <div className="hidden lg:block w-[280px] shrink-0" />,
})

export default Sidebar
