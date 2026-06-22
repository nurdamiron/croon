const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const STATIC_PAGES = [
  { slug: 'contacts', url: 'https://alash-electronics.kz/page/contacts' },
  { slug: 'payment', url: 'https://alash-electronics.kz/page/payment' },
  { slug: 'payment-2', url: 'https://alash-electronics.kz/page/payment-2' },
  { slug: 'delivery', url: 'https://alash-electronics.kz/page/delivery' },
  { slug: 'about-us', url: 'https://alash-electronics.kz/page/about-us' },
  { slug: 'oferta', url: 'https://alash-electronics.kz/page/oferta' },
  { slug: 'feedback', url: 'https://alash-electronics.kz/page/feedback' },
  { slug: 'alashed', url: 'https://alash-electronics.kz/page/alashed' },
];

const BLOG_POSTS = [
  { slug: '4wdsmartcarkitv2', blog: 'kits', url: 'https://alash-electronics.kz/blogs/kits/4wdsmartcarkitv2' },
  { slug: 'advanced-kit', blog: 'kits', url: 'https://alash-electronics.kz/blogs/kits/advanced-kit' },
  { slug: 'iotgreenhouse', blog: 'kits', url: 'https://alash-electronics.kz/blogs/kits/iotgreenhouse' },
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractMainContent(html) {
  // Try to extract content between common InSales content markers
  let content = '';

  // Try page content div
  const pageContentMatch = html.match(/<div[^>]*class="[^"]*page-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (pageContentMatch) {
    content = pageContentMatch[1];
  }

  // Try article/main content
  if (!content) {
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) content = articleMatch[1];
  }

  // Try .content or #content
  if (!content) {
    const contentMatch = html.match(/<div[^>]*(?:id|class)="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|\s*<footer)/i);
    if (contentMatch) content = contentMatch[1];
  }

  // Fallback: extract everything between header and footer
  if (!content) {
    const bodyMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (bodyMatch) content = bodyMatch[1];
  }

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/ - Alash electronics.*$/, '').trim() : '';

  // Extract h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].trim() : title;

  return { title: h1 || title, content: content || '', fullHtml: html };
}

async function main() {
  const pagesDir = path.join(DATA, 'pages');
  const blogsDir = path.join(DATA, 'blogs');
  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
  if (!fs.existsSync(blogsDir)) fs.mkdirSync(blogsDir, { recursive: true });

  // Scrape static pages
  console.log('Scraping static pages...');
  const pages = [];
  for (const page of STATIC_PAGES) {
    try {
      console.log(`  ${page.slug}...`);
      const html = await fetchPage(page.url);
      const { title, content, fullHtml } = extractMainContent(html);

      // Save full HTML for reference
      fs.writeFileSync(path.join(pagesDir, `${page.slug}.html`), fullHtml);

      pages.push({
        slug: page.slug,
        title,
        content,
        url: page.url,
      });
      console.log(`    OK: "${title}" (${content.length} chars)`);
    } catch (err) {
      console.error(`    FAIL: ${err.message}`);
      pages.push({ slug: page.slug, title: page.slug, content: '', url: page.url });
    }
  }

  fs.writeFileSync(path.join(DATA, 'pages.json'), JSON.stringify(pages, null, 2));
  console.log(`\nSaved ${pages.length} pages`);

  // Scrape blog posts
  console.log('\nScraping blog posts...');
  const blogs = [];
  for (const post of BLOG_POSTS) {
    try {
      console.log(`  ${post.slug}...`);
      const html = await fetchPage(post.url);
      const { title, content, fullHtml } = extractMainContent(html);

      fs.writeFileSync(path.join(blogsDir, `${post.slug}.html`), fullHtml);

      blogs.push({
        slug: post.slug,
        blog: post.blog,
        title,
        content,
        url: post.url,
      });
      console.log(`    OK: "${title}" (${content.length} chars)`);
    } catch (err) {
      console.error(`    FAIL: ${err.message}`);
      blogs.push({ slug: post.slug, blog: post.blog, title: post.slug, content: '', url: post.url });
    }
  }

  fs.writeFileSync(path.join(DATA, 'blogs.json'), JSON.stringify(blogs, null, 2));
  console.log(`\nSaved ${blogs.length} blog posts`);
}

main().catch(console.error);
