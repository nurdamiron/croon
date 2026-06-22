import { MetadataRoute } from 'next'
import { getAllProductSlugs, getAllCategorySlugs, getAllPageSlugs, getAllBlogPosts } from '@/lib/data'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

const BASE_URL = SITE_URL

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, pages, blogPosts] = await Promise.all([
    getAllProductSlugs(),
    getAllCategorySlugs(),
    getAllPageSlugs(),
    getAllBlogPosts(),
  ])

  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/collection/all`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/arduino-nabory`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/dlya-shkol`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/karta-sayta`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ]

  const categoryPages: MetadataRoute.Sitemap = categories.map((cat: { slug: string }) => ({
    url: `${BASE_URL}/collection/${cat.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Exclude variant products (slug ending in -2, -3, …) whose parent slug exists in the set
  // — their canonical already points to the parent, so they should not appear in the sitemap
  const slugSet = new Set(products.map((p: { slug: string }) => p.slug))
  const canonicalProducts = products.filter((p: { slug: string }) => {
    const m = p.slug.match(/^(.+)-(\d+)$/)
    return !(m && slugSet.has(m[1]))
  })

  const productPages: MetadataRoute.Sitemap = canonicalProducts.map((p: { slug: string; updatedAt: Date }) => ({
    url: `${BASE_URL}/product/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const contentPages: MetadataRoute.Sitemap = pages.map((p: { slug: string }) => ({
    url: `${BASE_URL}/page/${p.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post: { slug: string; blogSlug: string }) => ({
    url: `${BASE_URL}/blogs/${post.blogSlug}/${post.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  // Blog listing pages (unique blogSlugs)
  const blogSlugs = Array.from(new Set(blogPosts.map((p: { blogSlug: string }) => p.blogSlug)))
  const blogListingPages: MetadataRoute.Sitemap = blogSlugs.map((blogSlug: string) => ({
    url: `${BASE_URL}/blogs/${blogSlug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...categoryPages, ...productPages, ...contentPages, ...blogListingPages, ...blogPages]
}
