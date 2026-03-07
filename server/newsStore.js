import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import Parser from 'rss-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const FEEDS_FILE = path.join(DATA_DIR, 'feeds.json');

const parser = new Parser();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

// --- News storage helpers ---------------------------------------------------

export async function getNewsItems() {
  return readJson(NEWS_FILE, []);
}

export async function saveNewsItems(items) {
  await writeJson(NEWS_FILE, items);
}

export async function addNewsItem(partial) {
  const items = await getNewsItems();
  const now = new Date().toISOString();

  const item = {
    id: randomUUID(),
    title: partial.title || 'Untitled',
    source: partial.source || 'Unknown',
    source_url: partial.source_url || '',
    published_at: partial.published_at || now,
    summary: partial.summary || '',
    full_content: partial.full_content || '',
    entities: partial.entities || [],
    sentiment: partial.sentiment ?? null,
    sentiment_score: partial.sentiment_score ?? null,
    sector_tags: partial.sector_tags || [],
    macro_signals: partial.macro_signals || [],
    analysis_status: partial.analysis_status || 'pending',
    ingestion_source: partial.ingestion_source || 'user_submitted',
  };

  items.push(item);
  await saveNewsItems(items);
  return item;
}

// --- Feed configuration -----------------------------------------------------

export async function getFeeds() {
  return readJson(FEEDS_FILE, []);
}

export async function saveFeeds(feeds) {
  await writeJson(FEEDS_FILE, feeds);
}

export async function addFeed(url, name) {
  if (!url) {
    throw new Error('Feed URL is required');
  }
  const feeds = await getFeeds();
  const feed = {
    id: randomUUID(),
    url,
    name: name || url,
  };
  feeds.push(feed);
  await saveFeeds(feeds);
  return feed;
}

export async function deleteFeed(id) {
  const feeds = await getFeeds();
  const next = feeds.filter((f) => f.id !== id);
  await saveFeeds(next);
}

// --- RSS scraper ------------------------------------------------------------

export async function scrapeFeeds() {
  const feeds = await getFeeds();
  if (!feeds.length) {
    return { added: 0 };
  }

  const existing = await getNewsItems();
  const byUrl = new Map(existing.map((n) => [n.source_url, n]));
  let added = 0;

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];

      for (const entry of items) {
        const link = entry.link;
        if (!link || byUrl.has(link)) continue;

        let source = 'Unknown';
        try {
          const u = new URL(link);
          source = u.hostname.replace(/^www\./, '');
        } catch {
          // ignore URL parse errors, keep default source
        }

        const now = new Date().toISOString();

        const record = {
          id: randomUUID(),
          title: entry.title || 'Untitled',
          source,
          source_url: link,
          published_at: entry.isoDate || entry.pubDate || now,
          summary: entry.contentSnippet || entry.summary || '',
          full_content: entry.content || '',
          entities: [],
          sentiment: null,
          sentiment_score: null,
          sector_tags: [],
          macro_signals: [],
          analysis_status: 'pending',
          ingestion_source: 'api_fetch',
        };

        existing.push(record);
        byUrl.set(link, record);
        added += 1;
      }
    } catch (err) {
      console.error('Failed to scrape feed', feed.url, err);
    }
  }

  if (added > 0) {
    await saveNewsItems(existing);
  }

  return { added };
}

export function startScraperScheduler() {
  const intervalMs = Number(process.env.SCRAPER_INTERVAL_MS || '') || 15 * 60 * 1000;
  setInterval(() => {
    scrapeFeeds().catch((err) => {
      console.error('Scheduled scrape failed', err);
    });
  }, intervalMs);
}

