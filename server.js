const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 300 });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

const CATEGORIES = ['Comeback', 'MV', 'Drama', 'Idol', 'Concert', 'Scandal', 'Fashion'];

const TRENDING_KEYWORDS = [
  'aespa', 'BTS', 'BLACKPINK', 'NewJeans', 'IVE', 'TWICE', 'EXO',
  'Stray Kids', 'SEVENTEEN', 'NCT', 'LE SSERAFIM', 'Red Velvet',
  'ITZY', 'G-IDLE', 'TXT', 'ENHYPEN', 'Karina', 'Winter', 'Jungkook', 'V BTS',
];

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function timeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#8230;/gi, '...')
    .replace(/&hellip;/gi, '...')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#\d+;/gi, '')
    .replace(/&[a-z]+;/gi, '');
}

function cleanText(text) {
  if (!text) return '';
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

function detectCategory(title, desc) {
  const text = `${title} ${desc}`.toLowerCase();
  if (text.includes('comeback') || text.includes('mini album') || text.includes('full album') ||
      text.includes('single') || text.includes('album baru') || text.includes('merilis')) return 'Comeback';
  if (text.includes('mv') || text.includes('music video') || text.includes('teaser') ||
      text.includes('klip') || text.includes('video musik')) return 'MV';
  if (text.includes('drama') || text.includes('kdrama') || text.includes('series') ||
      text.includes('episode') || text.includes('drakor')) return 'Drama';
  if (text.includes('concert') || text.includes('tour') || text.includes('world tour') ||
      text.includes('konser') || text.includes('tur dunia') || text.includes('fan meeting') ||
      text.includes('fanmeeting')) return 'Concert';
  if (text.includes('scandal') || text.includes('controversy') || text.includes('dating') ||
      text.includes('skandal') || text.includes('kontroversi') || text.includes('pacaran') ||
      text.includes('bullying')) return 'Scandal';
  if (text.includes('fashion') || text.includes('outfit') || text.includes('style') ||
      text.includes('runway') || text.includes('busana') || text.includes('tampilan')) return 'Fashion';
  return 'Idol';
}

// ─── TRANSLATE ────────────────────────────────────────────────────────────────
// Free Google Translate endpoint — no API key needed
async function translateBatch(texts) {
  if (!texts || texts.length === 0) return texts;
  const SEP = ' ||||| ';
  try {
    const joined = texts.join(SEP);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(joined)}`;
    const res = await axios.get(url, { timeout: 6000 });
    const translated = res.data[0].map(x => x[0]).join('');
    const parts = translated.split(SEP.trim());
    // Fallback: return originals if count mismatch
    if (parts.length !== texts.length) return texts;
    return parts.map(s => s.trim());
  } catch {
    return texts;
  }
}

async function translateArticles(articles) {
  if (!articles || articles.length === 0) return articles;
  try {
    const titles = articles.map(a => a.title);
    const descs  = articles.map(a => a.description);
    const [tTitles, tDescs] = await Promise.all([
      translateBatch(titles),
      translateBatch(descs),
    ]);
    return articles.map((a, i) => ({
      ...a,
      title:       tTitles[i] || a.title,
      description: tDescs[i]  || a.description,
    }));
  } catch {
    return articles;
  }
}

// ─── SOOMPI (English → will be translated) ────────────────────────────────────
async function scrapeSoompi(query, page = 1) {
  try {
    const url = query
      ? `https://www.soompi.com/?s=${encodeURIComponent(query)}&paged=${page}`
      : `https://www.soompi.com/category/news/`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const articles = [];

    $('article, .article-card, .post').each((i, el) => {
      if (articles.length >= 8) return false;
      const $el = $(el);
      const title = cleanText($el.find('h1, h2, h3, .title, .post-title').first().text());
      const link  = $el.find('a').first().attr('href') || '';
      const img   = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
      const desc  = cleanText($el.find('p, .excerpt, .description').first().text());
      const dateRaw = $el.find('time, .date, .published').first().attr('datetime') || $el.find('time').first().text();

      if (title && link && title.length > 10) {
        articles.push({
          id: generateId(),
          title,
          description: desc || 'Baca artikel lengkap di Soompi.',
          thumbnail: img.startsWith('http') ? img : `https://soompi.com${img}`,
          url: link.startsWith('http') ? link : `https://soompi.com${link}`,
          source: 'Soompi',
          sourceIcon: 'S',
          category: detectCategory(title, desc),
          date: dateRaw || new Date().toISOString(),
          timeAgo: timeAgo(dateRaw || new Date()),
          needsTranslation: true,
        });
      }
    });

    return articles;
  } catch {
    return [];
  }
}

// ─── KOREABOO (English → will be translated) ──────────────────────────────────
async function scrapeKoreaboo(query) {
  try {
    const url = query
      ? `https://www.koreaboo.com/?s=${encodeURIComponent(query)}`
      : `https://www.koreaboo.com/`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const articles = [];

    $('article, .post, .story').each((i, el) => {
      if (articles.length >= 8) return false;
      const $el = $(el);
      const title = cleanText($el.find('h1, h2, h3, .title').first().text());
      const link  = $el.find('a').first().attr('href') || '';
      const img   = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
      const desc  = cleanText($el.find('p').first().text());
      const dateRaw = $el.find('time').first().attr('datetime') || '';

      if (title && link && title.length > 10) {
        articles.push({
          id: generateId(),
          title,
          description: desc || 'Baca artikel lengkap di Koreaboo.',
          thumbnail: img.startsWith('http') ? img : '',
          url: link.startsWith('http') ? link : `https://koreaboo.com${link}`,
          source: 'Koreaboo',
          sourceIcon: 'K',
          category: detectCategory(title, desc),
          date: dateRaw || new Date().toISOString(),
          timeAgo: timeAgo(dateRaw || new Date()),
          needsTranslation: true,
        });
      }
    });

    return articles;
  } catch {
    return [];
  }
}

// ─── GOOGLE NEWS INDONESIA ─────────────────────────────────────────────────────
async function scrapeGoogleNewsID(query) {
  try {
    const searchQuery = query ? `${query} kpop` : 'kpop berita';
    // hl=id&gl=ID → hasil dalam Bahasa Indonesia
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=id&gl=ID&ceid=ID:id`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const articles = [];

    $('item').each((i, el) => {
      if (articles.length >= 15) return false;
      const $el = $(el);
      const title   = cleanText($el.find('title').text());
      const link    = cleanText($el.find('link').text()) || $el.find('guid').text();
      const desc    = cleanText($el.find('description').text().replace(/<[^>]+>/g, ''));
      const dateRaw = $el.find('pubDate').text();
      const source  = cleanText($el.find('source').text()) || 'Google News';

      if (title && link) {
        articles.push({
          id: generateId(),
          title,
          description: desc || 'Klik untuk membaca artikel berita lengkap.',
          thumbnail: `https://picsum.photos/seed/${generateId()}/400/220`,
          url: link,
          source,
          sourceIcon: source.charAt(0).toUpperCase(),
          category: detectCategory(title, desc),
          date: dateRaw || new Date().toISOString(),
          timeAgo: timeAgo(dateRaw || new Date()),
          needsTranslation: false,
        });
      }
    });

    return articles;
  } catch {
    return [];
  }
}

// ─── KAPANLAGI (Indonesian K-pop source) ─────────────────────────────────────
async function scrapeKapanlagi(query) {
  try {
    const url = query
      ? `https://www.kapanlagi.com/search/?searchKeyword=${encodeURIComponent(query + ' kpop')}`
      : `https://www.kapanlagi.com/kpop/`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const articles = [];

    $('article, .content-card, .vod-item, h2 a, h3 a, .post-item').each((i, el) => {
      if (articles.length >= 8) return false;
      const $el = $(el);
      const titleEl = $el.is('a') ? $el : $el.find('a, h2, h3, .title').first();
      const title   = cleanText(titleEl.text() || $el.find('h2, h3, .title').first().text());
      const link    = $el.is('a') ? $el.attr('href') : ($el.find('a').first().attr('href') || '');
      const img     = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
      const desc    = cleanText($el.find('p, .desc, .excerpt').first().text());
      const dateRaw = $el.find('time, .date').first().attr('datetime') || '';

      if (title && link && title.length > 10 && link.includes('kapanlagi')) {
        articles.push({
          id: generateId(),
          title,
          description: desc || 'Baca selengkapnya di Kapanlagi.',
          thumbnail: img.startsWith('http') ? img : '',
          url: link.startsWith('http') ? link : `https://www.kapanlagi.com${link}`,
          source: 'Kapanlagi',
          sourceIcon: 'K',
          category: detectCategory(title, desc),
          date: dateRaw || new Date().toISOString(),
          timeAgo: timeAgo(dateRaw || new Date()),
          needsTranslation: false,
        });
      }
    });

    return articles;
  } catch {
    return [];
  }
}

// ─── SUARA.COM (Indonesian K-pop source) ─────────────────────────────────────
async function scrapeSuara(query) {
  try {
    const url = query
      ? `https://www.suara.com/search/?q=${encodeURIComponent(query + ' kpop')}`
      : `https://www.suara.com/tag/kpop`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const articles = [];

    $('article, .post-article, .list-article, .article-box').each((i, el) => {
      if (articles.length >= 8) return false;
      const $el = $(el);
      const title   = cleanText($el.find('h2, h3, h4, .title, a').first().text());
      const link    = $el.find('a').first().attr('href') || '';
      const img     = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
      const desc    = cleanText($el.find('p, .excerpt').first().text());
      const dateRaw = $el.find('time, .date').first().attr('datetime') || '';

      if (title && link && title.length > 10 && link.includes('suara.com')) {
        articles.push({
          id: generateId(),
          title,
          description: desc || 'Baca selengkapnya di Suara.com.',
          thumbnail: img.startsWith('http') ? img : '',
          url: link.startsWith('http') ? link : `https://www.suara.com${link}`,
          source: 'Suara.com',
          sourceIcon: 'S',
          category: detectCategory(title, desc),
          date: dateRaw || new Date().toISOString(),
          timeAgo: timeAgo(dateRaw || new Date()),
          needsTranslation: false,
        });
      }
    });

    return articles;
  } catch {
    return [];
  }
}

// ─── AGGREGATE ALL SOURCES ─────────────────────────────────────────────────────
async function scrapeAllSources(query, page = 1) {
  const cacheKey = `news_${query}_${page}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Jalankan semua sumber secara paralel
  const [googleID, soompi, koreaboo, kapanlagi, suara] = await Promise.allSettled([
    scrapeGoogleNewsID(query),
    scrapeSoompi(query, page),
    scrapeKoreaboo(query),
    scrapeKapanlagi(query),
    scrapeSuara(query),
  ]);

  const idArticles = [
    ...(googleID.status === 'fulfilled'  ? googleID.value  : []),
    ...(kapanlagi.status === 'fulfilled' ? kapanlagi.value : []),
    ...(suara.status === 'fulfilled'     ? suara.value     : []),
  ];

  const enArticles = [
    ...(soompi.status === 'fulfilled'    ? soompi.value    : []),
    ...(koreaboo.status === 'fulfilled'  ? koreaboo.value  : []),
  ];

  // Terjemahkan artikel bahasa Inggris ke Indonesia
  const translatedEN = enArticles.length > 0
    ? await translateArticles(enArticles)
    : [];

  let articles = [
    ...idArticles,
    ...translatedEN,
  ].map(a => {
    const { needsTranslation, ...rest } = a;
    return rest;
  });

  // Deduplikasi & shuffle
  articles = articles
    .filter((a, idx, arr) => a.title && arr.findIndex(b => b.title === a.title) === idx)
    .sort(() => Math.random() - 0.5);

  if (articles.length === 0) {
    articles = generateFallbackNews(query);
  }

  cache.set(cacheKey, articles);
  return articles;
}

// ─── FALLBACK BERITA ──────────────────────────────────────────────────────────
function generateFallbackNews(query) {
  const baseKeywords = query ? [query] : TRENDING_KEYWORDS.slice(0, 10);
  const kw = baseKeywords[0] || 'aespa';
  const fallbackImages = [
    'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&h=220&fit=crop',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=220&fit=crop',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=220&fit=crop',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=220&fit=crop',
    'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=220&fit=crop',
    'https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=400&h=220&fit=crop',
  ];

  const headlines = [
    `${kw} Menduduki Puncak Tangga Lagu Dengan Comeback Terbaru`,
    `${kw} Umumkan Jadwal Tur Dunia`,
    `MV ${kw} Pecahkan Rekor YouTube Dalam 24 Jam`,
    `Industri K-pop Laporkan Pertumbuhan Global Yang Masif`,
    `${kw} Berkolaborasi Dengan Artis Internasional`,
    `Tren Fashion Idol K-pop Mendominasi Panggung Mode Dunia`,
    `Drama Korea Dibintangi Idol K-pop Pecahkan Rekor Streaming`,
    `Konser ${kw} Habis Terjual Dalam Hitungan Menit`,
    `Acara Survival K-pop Baru Umumkan Lineup Debut`,
    `${kw} Raih Penghargaan Artis Terbaik Di Ajang Bergengsi`,
  ];

  return headlines.map((title, i) => ({
    id: generateId(),
    title,
    description: `Ikuti terus perkembangan berita terbaru seputar ${query || 'K-pop'} dari panggung Hallyu global. Nantikan liputan eksklusif selanjutnya.`,
    thumbnail: fallbackImages[i % fallbackImages.length],
    url: `https://www.soompi.com/?s=${encodeURIComponent(query || 'kpop')}`,
    source: ['Soompi', 'Koreaboo', 'Kapanlagi', 'Suara.com'][i % 4],
    sourceIcon: ['S', 'K', 'K', 'S'][i % 4],
    category: CATEGORIES[i % CATEGORIES.length],
    date: new Date(Date.now() - i * 3600000).toISOString(),
    timeAgo: timeAgo(new Date(Date.now() - i * 3600000)),
  }));
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q = '', category = '', page = 1 } = req.query;

    if (!q && !category) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "q" atau "category" wajib diisi.',
        code: 400,
      });
    }

    const searchQuery = category ? `${q} ${category} kpop`.trim() : `${q} kpop`;
    let articles = await scrapeAllSources(searchQuery, parseInt(page));

    if (category) {
      const filtered = articles.filter(a => a.category.toLowerCase() === category.toLowerCase());
      if (filtered.length > 0) articles = filtered;
    }

    const pageNum = parseInt(page);
    const perPage = 12;
    const paginated = articles.slice((pageNum - 1) * perPage, pageNum * perPage);

    res.json({
      success: true,
      query: q,
      category: category || null,
      page: pageNum,
      perPage,
      total: articles.length,
      hasMore: articles.length > pageNum * perPage,
      data: paginated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 500 });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const cached = cache.get('trending');
    if (cached) return res.json(cached);

    const shuffled = [...TRENDING_KEYWORDS].sort(() => Math.random() - 0.5);
    const trending = shuffled.slice(0, 12).map((kw, i) => ({
      rank: i + 1,
      keyword: kw,
      trend: Math.random() > 0.5 ? 'up' : 'stable',
      count: Math.floor(Math.random() * 50000) + 1000,
    }));

    const result = {
      success: true,
      data: trending,
      updatedAt: new Date().toISOString(),
    };

    cache.set('trending', result, 120);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 500 });
  }
});

app.get('/api/news', async (req, res) => {
  try {
    const { category = '', page = 1, limit = 12 } = req.query;
    const cacheKey = `latestnews_${category}_${page}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const query = category ? `${category} kpop` : 'kpop';
    let articles = await scrapeAllSources(query, parseInt(page));

    if (category) {
      const filtered = articles.filter(a => a.category.toLowerCase() === category.toLowerCase());
      if (filtered.length > 0) articles = filtered;
    }

    const pageNum = parseInt(page);
    const perPage = parseInt(limit);
    const paginated = articles.slice((pageNum - 1) * perPage, pageNum * perPage);

    const result = {
      success: true,
      category: category || 'all',
      page: pageNum,
      perPage,
      total: articles.length,
      hasMore: articles.length > pageNum * perPage,
      data: paginated,
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, result, 180);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 500 });
  }
});

app.get('/api/categories', (req, res) => {
  res.json({
    success: true,
    data: CATEGORIES.map(c => ({ name: c, slug: c.toLowerCase() })),
  });
});

app.get('/apidoc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apidoc.html'));
});

// ─── SITEMAP.XML ──────────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const base = `https://${req.hostname}`;
  const now  = new Date().toISOString().split('T')[0];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <url>
    <loc>${base}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="id" href="${base}/"/>
  </url>

  <url>
    <loc>${base}/apidoc</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="id" href="${base}/apidoc"/>
  </url>

  <url>
    <loc>${base}/api/trending</loc>
    <lastmod>${now}</lastmod>
    <changefreq>always</changefreq>
    <priority>0.6</priority>
  </url>

  <url>
    <loc>${base}/api/categories</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>

</urlset>`;
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(sitemap);
});

// ─── SECURITY & SEO HEADERS ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VyBrowse server running on port ${PORT}`);
});

module.exports = app;
