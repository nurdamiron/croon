/**
 * ALASH ELECTRONICS — Blog Bot
 * Publishes 10+ articles/day about electronics, Arduino, DIY kits, STEM hardware for Kazakhstan.
 * Writes to BlogPost table (Prisma-managed) in alash-electronics DB.
 * Schedule: hourly, 8:00-22:00 AST via PM2 cron.
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../frontend/.env") });
require("dotenv").config({ path: path.join(__dirname, "../frontend/.env.local"), override: false });

const { Pool } = require("pg");
const { callPerplexity, cleanText } = require("../../blog-bot-core");

const PERPLEXITY_KEY  = process.env.PERPLEXITY_API_KEY;
const UNSPLASH_KEY    = process.env.UNSPLASH_ACCESS_KEY;
const INDEXNOW_KEY    = process.env.INDEXNOW_KEY || null;
const SITE_URL        = "https://shop.alashed.kz";
const HOST            = "shop.alashed.kz";
const TOPICS_PER_RUN  = 10;

// Parse DATABASE_URL from Prisma .env
const DB_URL = process.env.DATABASE_URL || "";
const pool   = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

const VALID_BLOG_SLUGS = ["kits", "arduino", "stem", "guides", "reviews"];

const SYSTEM_PROMPT = `You are a content specialist for ИП КРУН — an online electronics and STEM kits store in Kazakhstan.
Write practical Russian articles for hobbyists, teachers, students and parents buying electronics, Arduino kits, sensors, robotics components.
Include: real product names with prices in KZT (1 USD ≈ 450 KZT), specific model numbers, beginner-friendly instructions, Kazakhstan delivery context.
Content should help buyers make decisions and learn to use products.
STRICT: No emoji, no [1][2] citation markers. Return ONLY valid JSON array — no markdown wrapper.`;

function blocksToHtml(blocks) {
  return blocks.map((b) => {
    if (b.type === "subheading") return `<h2>${b.content}</h2>`;
    if (b.type === "list") return `<ul>${b.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    if (b.type === "faq") return `<div class="faq"><p><strong>${b.question}</strong></p><p>${b.answer}</p></div>`;
    return `<p>${b.content}</p>`;
  }).join("\n");
}

async function fetchCoverImage(query) {
  if (!UNSPLASH_KEY || !query) return null;
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`, {
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    });
    const data = await res.json();
    return data.results?.[0]?.urls?.regular || null;
  } catch { return null; }
}

async function slugExists(slug) {
  const r = await pool.query('SELECT 1 FROM "BlogPost" WHERE slug=$1 LIMIT 1', [slug]);
  return r.rows.length > 0;
}

async function savePost({ slug, blogSlug, title, content }) {
  await pool.query(
    `INSERT INTO "BlogPost" (id, title, slug, "blogSlug", content, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (slug) DO UPDATE SET "updatedAt"=NOW()`,
    [title, slug, blogSlug, content]
  );
}

async function pingIndexNow(slugs) {
  if (!INDEXNOW_KEY || !slugs.length) return;
  try {
    const urls = slugs.map((s) => `${SITE_URL}/blogs/kits/${s}`);
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, urlList: urls }),
    });
    console.log(`[indexnow] pinged ${urls.length} URLs`);
  } catch (e) {
    console.error("[indexnow]", e.message);
  }
}

async function generateTopics() {
  const today = new Date().toISOString().split("T")[0];
  const year  = today.slice(0, 4);

  const prompt = `Today: ${today}.

Generate exactly ${TOPICS_PER_RUN} unique Russian articles about electronics and STEM products for buyers in Kazakhstan.

TOPIC DISTRIBUTION:
- 3 articles: Starter kits and Arduino projects — Arduino UNO Starter Kit (~15,000 KZT), Raspberry Pi 4 (~45,000 KZT), sensors bundles — step-by-step project guides
- 2 articles: Beginner guides — "What to buy for a child's first robot", "ESP32 vs Arduino: which to choose", "How to start programming with Scratch + micro:bit"
- 2 articles: Product reviews — compare 2-3 specific kits/modules with real prices in KZT, pros/cons, use cases
- 2 articles: Project tutorials — build something (weather station, plant watering system, LED matrix) — parts list with KZT prices, wiring diagram description, code explanation
- 1 article: Buying guide for schools — STEM classroom equipment, budget for 30 students, ROI for school directors

Return EXACTLY this JSON array (no wrapper):
[
  {
    "slug": "unique-slug-${year}",
    "blog_slug": "kits",
    "title": "Заголовок статьи 50-80 символов",
    "unsplash_query": "electronics arduino circuit board",
    "body": [
      {"type": "paragraph", "content": "Вводный абзац с конкретными ценами и деталями."},
      {"type": "subheading", "content": "Что входит в набор"},
      {"type": "paragraph", "content": "Детальное описание с перечислением компонентов."},
      {"type": "list", "items": ["Arduino UNO — основная плата", "USB кабель", "10 светодиодов", "30 резисторов 220 Ом"]},
      {"type": "subheading", "content": "Первый проект: мигающий светодиод"},
      {"type": "paragraph", "content": "Пошаговая инструкция..."},
      {"type": "subheading", "content": "Часто задаваемые вопросы"},
      {"type": "faq", "question": "Для какого возраста подходит этот набор?", "answer": "С 10 лет."},
      {"type": "faq", "question": "Сколько стоит доставка по Казахстану?", "answer": "300-500 KZT."},
      {"type": "paragraph", "content": "Заключение с призывом к покупке."}
    ]
  }
]

blog_slug MUST be one of: kits, arduino, stem, guides, reviews
Exactly ${TOPICS_PER_RUN} items. Every slug globally unique. No Cyrillic in slug.`;

  const { text } = await callPerplexity(
    { systemPrompt: SYSTEM_PROMPT, userMessage: prompt, maxTokens: 16000, temperature: 0.3 },
    PERPLEXITY_KEY
  );
  return JSON.parse(text);
}

async function run() {
  if (!PERPLEXITY_KEY) {
    console.error("[bot] PERPLEXITY_API_KEY not set");
    process.exit(1);
  }

  // Random delay 0-12h so 10 articles spread across 9:00-21:00 AST
  const delayMs = Math.floor(Math.random() * 43200000);
  console.log(`[bot] sleeping ${Math.round(delayMs / 60000)} min before posting...`);
  await new Promise(r => setTimeout(r, delayMs));

  const newSlugs = [];

  try {
    console.log(`[bot] generating ${TOPICS_PER_RUN} topics for shop.alashed.kz...`);
    const topics = await generateTopics();

    for (const p of topics) {
      const slug = String(p.slug || "")
        .slice(0, 200)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      if (!slug || !p.title) { console.warn("[bot] skip: missing slug/title"); continue; }
      if (await slugExists(slug)) { console.log(`[bot] skip duplicate: ${slug}`); continue; }

      const blogSlug = VALID_BLOG_SLUGS.includes(p.blog_slug) ? p.blog_slug : "kits";
      const imageUrl = await fetchCoverImage(p.unsplash_query);

      const htmlParts = [];
      if (imageUrl) {
        htmlParts.push(`<img src="${imageUrl}" alt="${cleanText(p.title)}" style="width:100%;border-radius:8px;margin-bottom:1rem" />`);
      }
      htmlParts.push(blocksToHtml(Array.isArray(p.body) ? p.body : []));
      const content = htmlParts.join("\n");

      await savePost({ slug, blogSlug, title: cleanText(p.title), content });
      console.log(`[bot] saved: ${slug} (${blogSlug})`);
      newSlugs.push(slug);
    }

    if (newSlugs.length > 0) {
      await pingIndexNow(newSlugs);
    }

    console.log(`[bot] done. published: ${newSlugs.length}`);
  } catch (e) {
    console.error("[bot] fatal:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
