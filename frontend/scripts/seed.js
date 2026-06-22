const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const DATA = path.join(__dirname, '..', '..', 'data');
const PAGES_DIR = path.join(__dirname, '..', '..', '.firecrawl', 'pages');

async function main() {
  console.log('Starting seed...\n');

  // 1. Seed categories
  console.log('Seeding categories...');
  const categories = JSON.parse(fs.readFileSync(path.join(DATA, 'categories.json'), 'utf-8'));

  // First pass: create all categories without parent references
  for (const cat of categories) {
    if (!cat.slug) continue;
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {
        name: cat.name,
        slug: cat.slug,
        imageUrl: cat.imageUrl || null,
        description: cat.description || null,
        isHidden: cat.isHidden || false,
      },
      create: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        imageUrl: cat.imageUrl || null,
        description: cat.description || null,
        isHidden: cat.isHidden || false,
      },
    });
  }

  // Second pass: set parent relationships
  for (const cat of categories) {
    if (!cat.slug || !cat.parentId) continue;
    // Check if parent exists
    const parent = await prisma.category.findUnique({ where: { id: cat.parentId } });
    if (parent) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { parentId: cat.parentId },
      });
    }
  }

  const catCount = await prisma.category.count();
  console.log(`  Categories: ${catCount}\n`);

  // 2. Seed products
  console.log('Seeding products...');
  const products = JSON.parse(fs.readFileSync(path.join(DATA, 'products.json'), 'utf-8'));

  // Load image URL map
  let imageUrlMap = {};
  const mapPath = path.join(DATA, 'image-url-map.json');
  if (fs.existsSync(mapPath)) {
    imageUrlMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  }

  let productCount = 0;
  let skipped = 0;

  for (const product of products) {
    if (!product.slug) {
      skipped++;
      continue;
    }

    // Check if category exists
    let categoryId = null;
    if (product.categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: product.categoryId } });
      if (cat) categoryId = product.categoryId;
    }

    try {
      await prisma.product.upsert({
        where: { id: product.groupId },
        update: {
          name: product.name,
          slug: product.slug,
          description: product.description || null,
          price: product.price || 0,
          oldPrice: product.oldPrice || null,
          inStock: product.inStock || false,
          totalStock: product.totalStock || 0,
          weight: product.weight || null,
          categoryId,
        },
        create: {
          id: product.groupId,
          name: product.name,
          slug: product.slug,
          description: product.description || null,
          price: product.price || 0,
          oldPrice: product.oldPrice || null,
          inStock: product.inStock || false,
          totalStock: product.totalStock || 0,
          weight: product.weight || null,
          categoryId,
        },
      });

      // Upsert images
      await prisma.productImage.deleteMany({ where: { productId: product.groupId } });
      for (let i = 0; i < product.pictures.length; i++) {
        const originalUrl = product.pictures[i];
        const localUrl = imageUrlMap[originalUrl] || originalUrl;
        await prisma.productImage.create({
          data: {
            productId: product.groupId,
            url: localUrl,
            alt: product.name,
            sortOrder: i,
          },
        });
      }

      // Upsert variants
      await prisma.productVariant.deleteMany({ where: { productId: product.groupId } });
      for (const variant of product.variants) {
        await prisma.productVariant.create({
          data: {
            id: variant.variantId,
            productId: product.groupId,
            price: variant.price || 0,
            oldPrice: variant.oldPrice || null,
            sku: variant.sku || null,
            stock: variant.stock || 0,
            available: variant.available || false,
          },
        });
      }

      productCount++;
      if (productCount % 100 === 0) {
        console.log(`  Progress: ${productCount}/${products.length}`);
      }
    } catch (err) {
      console.error(`  Error with product ${product.slug}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  Products: ${productCount} (skipped: ${skipped})\n`);

  // 3. Seed pages from Firecrawl
  console.log('Seeding pages...');
  const pageFiles = [
    { slug: 'contacts', title: 'Контакты' },
    { slug: 'payment', title: 'Оплата' },
    { slug: 'payment-2', title: 'Условия оплаты' },
    { slug: 'delivery', title: 'Доставка' },
    { slug: 'about-us', title: 'О компании' },
    { slug: 'oferta', title: 'Политика безопасности' },
    { slug: 'feedback', title: 'Обратная связь' },
    { slug: 'alashed', title: 'AlashEd — Товары для Гос.закупа' },
  ];

  for (const page of pageFiles) {
    const filePath = path.join(PAGES_DIR, `${page.slug}.md`);
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
    }
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: { title: page.title, content },
      create: { title: page.title, slug: page.slug, content },
    });
  }
  console.log(`  Pages: ${pageFiles.length}\n`);

  // 4. Seed blog posts
  console.log('Seeding blog posts...');
  const blogFiles = [
    { slug: '4wdsmartcarkitv2', blog: 'kits', title: '4WD Smart Car kit v2' },
    { slug: 'advanced-kit', blog: 'kits', title: 'Electronics Adventure Kit' },
    { slug: 'iotgreenhouse', blog: 'kits', title: 'IoT GreenHouse' },
  ];

  for (const post of blogFiles) {
    const filePath = path.join(PAGES_DIR, `${post.slug}.md`);
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
    }
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: { title: post.title, blogSlug: post.blog, content },
      create: { title: post.title, slug: post.slug, blogSlug: post.blog, content },
    });
  }
  console.log(`  Blog posts: ${blogFiles.length}\n`);

  console.log('=== Seed complete! ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
