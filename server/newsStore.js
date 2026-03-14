import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import Parser from 'rss-parser';
import { DEFAULT_FEEDS } from './defaultFeeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const FEEDS_FILE = path.join(DATA_DIR, 'feeds.json');
const NEWS_ARCHIVE_FILE = path.join(DATA_DIR, 'news.archive.json');

const DEFAULT_MAX_ACTIVE_ITEMS = 5000;
const DEFAULT_DEEP_PASS_PERCENT = 0.2;

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

function normalizePercent(rawValue, fallback) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function envEnabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseIsoMs(value, fallback = 0) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : fallback;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const SOURCE_CREDIBILITY_HINTS = [
  { test: /reuters|bloomberg|wsj|ft\.com|cnbc|seekingalpha/i, score: 0.9 },
  { test: /marketwatch|investopedia|themotleyfool|fool\.com|yahoo/i, score: 0.75 },
  { test: /substack|medium|blog|unknown/i, score: 0.45 },
];

const IMPACT_KEYWORDS = [
  'fda',
  'lawsuit',
  'antitrust',
  'guidance',
  'earnings',
  'sec',
  'rate cut',
  'rate hike',
  'merger',
  'acquisition',
  'bankruptcy',
  'layoff',
  'tariff',
  'recall',
  'downgrade',
  'upgrade',
  'default',
  'sanction',
  'export ban',
  'miss',
  'beat',
];

function getImpactKeywordScore(item) {
  const text = `${item?.title || ''} ${item?.summary || ''}`.toLowerCase();
  let hits = 0;
  for (const keyword of IMPACT_KEYWORDS) {
    if (text.includes(keyword)) hits += 1;
  }
  return clamp01(hits / 4);
}

function getSourceCredibilityScore(item) {
  if (Number.isFinite(Number(item?.source_credibility_score))) {
    return clamp01(Number(item.source_credibility_score));
  }
  const sourceText = `${item?.source || ''} ${item?.source_url || ''}`;
  for (const hint of SOURCE_CREDIBILITY_HINTS) {
    if (hint.test.test(sourceText)) return hint.score;
  }
  return 0.6;
}

function stableTokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 32)
  );
}

function jaccardSimilarity(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  const union = left.size + right.size - overlap;
  return union > 0 ? overlap / union : 0;
}

function getNoveltyScore(item, peers) {
  const itemTokens = stableTokenSet(`${item?.title || ''} ${item?.summary || ''}`);
  if (itemTokens.size === 0) return 0.5;
  let maxSimilarity = 0;
  for (const peer of peers) {
    if (peer.id === item.id) continue;
    const ageDiffMs = Math.abs(parseIsoMs(peer.published_at) - parseIsoMs(item.published_at));
    // Only compare within a 7-day window to estimate duplicate/echo coverage.
    if (ageDiffMs > 7 * 24 * 60 * 60 * 1000) continue;
    const peerTokens = stableTokenSet(`${peer?.title || ''} ${peer?.summary || ''}`);
    const similarity = jaccardSimilarity(itemTokens, peerTokens);
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  }
  return clamp01(1 - maxSimilarity);
}

export function getNewsStorageConfig() {
  const maxActiveItems = Number(process.env.NEWS_MAX_ACTIVE_ITEMS || '') || DEFAULT_MAX_ACTIVE_ITEMS;
  const archiveEnabled = envEnabled(process.env.NEWS_ARCHIVE_ENABLED, true);
  const deepPassPercent = normalizePercent(process.env.NEWS_DEEP_PASS_PERCENT, DEFAULT_DEEP_PASS_PERCENT);
  return {
    maxActiveItems,
    archiveEnabled,
    deepPassPercent,
  };
}

export function computeNewsImportance(item, peers = []) {
  const nowMs = Date.now();
  const publishedMs = parseIsoMs(item?.published_at, nowMs);
  const ageDays = Math.max(0, (nowMs - publishedMs) / (1000 * 60 * 60 * 24));

  const sentimentStrength = clamp01(Math.abs(Number(item?.sentiment_score) || 0));
  const sourceCredibility = getSourceCredibilityScore(item);
  const impactKeywordScore = getImpactKeywordScore(item);
  const noveltyScore = Number.isFinite(Number(item?.novelty_score))
    ? clamp01(Number(item.novelty_score))
    : getNoveltyScore(item, peers);
  const uncertaintyScore = clamp01(Number(item?.uncertainty_score) || 0.35);
  const recencyScore = clamp01(1 - ageDays / 30);

  const entitiesCount = Array.isArray(item?.entities) ? item.entities.length : 0;
  const macroCount = Array.isArray(item?.macro_signals) ? item.macro_signals.length : 0;
  const sectorsCount = Array.isArray(item?.sector_tags) ? item.sector_tags.length : 0;
  const breadthScore = clamp01((entitiesCount + macroCount + sectorsCount) / 12);

  const score = clamp01(
    sentimentStrength * 0.24 +
    sourceCredibility * 0.22 +
    impactKeywordScore * 0.2 +
    noveltyScore * 0.16 +
    recencyScore * 0.1 +
    breadthScore * 0.05 +
    uncertaintyScore * 0.03
  );

  return {
    score,
    breakdown: {
      sentiment_strength: sentimentStrength,
      source_credibility: sourceCredibility,
      impact_keywords: impactKeywordScore,
      novelty: noveltyScore,
      recency: recencyScore,
      breadth: breadthScore,
      uncertainty: uncertaintyScore,
    },
  };
}

function isNeutralArticle(item) {
  const sentiment = String(item?.sentiment || '').toLowerCase();
  const absScore = Math.abs(Number(item?.sentiment_score) || 0);
  return sentiment === 'neutral' || sentiment === 'mixed' || absScore < 0.18;
}

function pruneSortKey(item) {
  return {
    neutralFirst: isNeutralArticle(item) ? 0 : 1,
    importance: Number(item.importance_score) || 0,
    publishedMs: parseIsoMs(item.published_at, 0),
  };
}

function comparePrunePriority(left, right) {
  const l = pruneSortKey(left);
  const r = pruneSortKey(right);
  if (l.neutralFirst !== r.neutralFirst) return l.neutralFirst - r.neutralFirst;
  if (l.importance !== r.importance) return l.importance - r.importance;
  return l.publishedMs - r.publishedMs;
}

async function appendArchive(items, reason) {
  if (!items.length) return;
  const archive = await readJson(NEWS_ARCHIVE_FILE, []);
  const now = new Date().toISOString();
  for (const item of items) {
    archive.push({
      ...item,
      archived_at: now,
      archive_reason: reason,
    });
  }
  await writeJson(NEWS_ARCHIVE_FILE, archive);
}

// --- News storage helpers ---------------------------------------------------

export async function getNewsItems() {
  return readJson(NEWS_FILE, []);
}

export async function saveNewsItems(items) {
  await writeJson(NEWS_FILE, items);
}

export async function pruneNewsItemsByImportance(options = {}) {
  const cfg = getNewsStorageConfig();
  const maxActiveItems = Math.max(1, Number(options.maxActiveItems) || cfg.maxActiveItems);
  const archiveEnabled = options.archiveEnabled === undefined ? cfg.archiveEnabled : Boolean(options.archiveEnabled);
  const importanceFloor = Number.isFinite(Number(options.importanceFloor))
    ? clamp01(Number(options.importanceFloor))
    : null;

  const items = await getNewsItems();
  if (!items.length) {
    return {
      before_count: 0,
      after_count: 0,
      removed_count: 0,
      removed_ids: [],
      archived_count: 0,
      max_active_items: maxActiveItems,
      importance_floor: importanceFloor,
    };
  }

  const scored = items.map((item) => {
    const importance = computeNewsImportance(item, items);
    return {
      ...item,
      importance_score: importance.score,
      importance_breakdown: importance.breakdown,
      source_credibility_score: item.source_credibility_score ?? importance.breakdown.source_credibility,
      novelty_score: item.novelty_score ?? importance.breakdown.novelty,
      last_importance_scored_at: new Date().toISOString(),
    };
  });

  let retained = scored;
  let removed = [];

  if (importanceFloor !== null) {
    const nextRetained = [];
    for (const item of retained) {
      if ((Number(item.importance_score) || 0) < importanceFloor) {
        removed.push(item);
      } else {
        nextRetained.push(item);
      }
    }
    retained = nextRetained;
  }

  if (retained.length > maxActiveItems) {
    const extraCount = retained.length - maxActiveItems;
    const candidates = [...retained].sort(comparePrunePriority);
    const toRemove = candidates.slice(0, extraCount);
    const removeSet = new Set(toRemove.map((item) => item.id));
    removed = removed.concat(toRemove);
    retained = retained.filter((item) => !removeSet.has(item.id));
  }

  await saveNewsItems(retained);
  if (archiveEnabled && removed.length > 0) {
    await appendArchive(removed, 'importance_prune');
  }

  return {
    before_count: items.length,
    after_count: retained.length,
    removed_count: removed.length,
    removed_ids: removed.map((item) => item.id),
    archived_count: archiveEnabled ? removed.length : 0,
    max_active_items: maxActiveItems,
    importance_floor: importanceFloor,
  };
}

export async function addNewsItem(partial) {
  const items = await getNewsItems();
  const now = new Date();

  // Clamp any future dates to now
  let publishedAt = partial.published_at || now.toISOString();
  const parsedDate = new Date(publishedAt);
  if (!isNaN(parsedDate) && parsedDate > now) {
    publishedAt = now.toISOString();
  }

  const item = {
    id: randomUUID(),
    title: partial.title || 'Untitled',
    source: partial.source || 'Unknown',
    source_url: partial.source_url || '',
    published_at: publishedAt,
    summary: partial.summary || '',
    full_content: partial.full_content || '',
    entities: partial.entities || [],
    sentiment: partial.sentiment ?? null,
    sentiment_score: partial.sentiment_score ?? null,
    sector_tags: partial.sector_tags || [],
    macro_signals: partial.macro_signals || [],
    price_impact_estimate: partial.price_impact_estimate || '',
    source_credibility_score: partial.source_credibility_score ?? null,
    impact_keywords: partial.impact_keywords || [],
    uncertainty_score: partial.uncertainty_score ?? null,
    novelty_score: partial.novelty_score ?? null,
    deep_analysis_candidate: partial.deep_analysis_candidate ?? null,
    deep_analysis_rationale: partial.deep_analysis_rationale || '',
    signal_facts: partial.signal_facts || null,
    importance_score: partial.importance_score ?? null,
    importance_breakdown: partial.importance_breakdown || null,
    analysis_status: partial.analysis_status || 'pending',
    ingestion_source: partial.ingestion_source || 'user_submitted',
  };

  items.push(item);
  await saveNewsItems(items);
  return item;
}

export async function updateNewsItem(id, data) {
  const items = await getNewsItems();
  const idx = items.findIndex((n) => n.id === id);
  if (idx === -1) throw new Error('News item not found: ' + id);
  // Only allow updating analysis-related fields
  const allowed = [
    'summary',
    'entities',
    'sentiment',
    'sentiment_score',
    'sector_tags',
    'macro_signals',
    'price_impact_estimate',
    'analysis_status',
    'source_credibility_score',
    'impact_keywords',
    'uncertainty_score',
    'novelty_score',
    'deep_analysis_candidate',
    'deep_analysis_rationale',
    'signal_facts',
    'importance_score',
    'importance_breakdown',
    'last_analyzed_at',
    'fast_analysis_completed_at',
    'deep_analysis_completed_at',
    'full_content',
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) items[idx][key] = data[key];
  }
  await saveNewsItems(items);
  return items[idx];
}

// --- Feed configuration -----------------------------------------------------

export async function getFeeds() {
  const feeds = await readJson(FEEDS_FILE, null);
  if (feeds !== null && feeds.length > 0) {
    return feeds;
  }
  // First run — seed with default feeds
  const seeded = DEFAULT_FEEDS.map((f) => ({
    id: randomUUID(),
    url: f.url,
    name: f.name,
    category: f.category || 'General',
    default: true,
  }));
  await writeJson(FEEDS_FILE, seeded);
  return seeded;
}

export async function saveFeeds(feeds) {
  await writeJson(FEEDS_FILE, feeds);
}

export async function addFeed(url, name, category, crawlMethod) {
  if (!url) {
    throw new Error('Feed URL is required');
  }
  const feeds = await getFeeds();
  const feed = {
    id: randomUUID(),
    url,
    name: name || url,
    category: category || 'General',
    crawl_method: crawlMethod || 'rss',
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

async function scrapeRssFeed(feed, byUrl) {
  const records = [];
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

      const now = new Date();
      const rawDate = entry.isoDate || entry.pubDate || null;
      // Clamp future dates to now (some feeds have clock-skew or timezone issues)
      let publishedAt = now.toISOString();
      if (rawDate) {
        const parsed = new Date(rawDate);
        publishedAt = (!isNaN(parsed) && parsed <= now) ? parsed.toISOString() : now.toISOString();
      }

      records.push({
        id: randomUUID(),
        title: entry.title || 'Untitled',
        source,
        source_url: link,
        published_at: publishedAt,
        summary: entry.contentSnippet || entry.summary || '',
        full_content: entry.content || '',
        entities: [],
        sentiment: null,
        sentiment_score: null,
        sector_tags: [],
        macro_signals: [],
        analysis_status: 'pending',
        ingestion_source: 'api_fetch',
      });
      byUrl.set(link, true);
    }
  } catch (err) {
    console.error('Failed to scrape RSS feed', feed.url, err);
  }
  return records;
}

// --- Cloudflare /crawl integration ------------------------------------------

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';

function isCloudflareConfigured() {
  return CF_ACCOUNT_ID.length > 0 && CF_API_TOKEN.length > 0;
}

export function getCloudflareStatus() {
  return { configured: isCloudflareConfigured() };
}

async function crawlWithCloudflare(feed, byUrl) {
  if (!isCloudflareConfigured()) {
    console.warn('Cloudflare crawl requested but not configured, skipping', feed.url);
    return [];
  }

  const records = [];
  try {
    // Start crawl job
    const startRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: feed.url,
          limit: 20,
          depth: 1,
          formats: ['markdown'],
          render: false,
        }),
      }
    );

    if (!startRes.ok) {
      const text = await startRes.text().catch(() => '');
      throw new Error(`Cloudflare crawl start failed: ${startRes.status} ${text}`);
    }

    const startData = await startRes.json();
    const jobId = startData.result;
    if (!jobId) throw new Error('No job ID returned from Cloudflare crawl');

    // Poll for completion (max 60 attempts, 5s apart = 5 minutes)
    let crawlResult = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl/${jobId}?limit=1`,
        { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
      );
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      if (pollData.result?.status !== 'running') {
        crawlResult = pollData.result;
        break;
      }
    }

    if (!crawlResult || crawlResult.status !== 'completed') {
      console.warn('Cloudflare crawl did not complete for', feed.url, crawlResult?.status);
      return records;
    }

    // Fetch full results
    const resultsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl/${jobId}?status=completed`,
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
    );
    if (!resultsRes.ok) return records;
    const resultsData = await resultsRes.json();

    for (const page of resultsData.result?.records || []) {
      const pageUrl = page.metadata?.url || page.url;
      if (!pageUrl || byUrl.has(pageUrl)) continue;

      let source = 'Unknown';
      try {
        const u = new URL(pageUrl);
        source = u.hostname.replace(/^www\./, '');
      } catch {
        // ignore
      }

      const title = page.metadata?.title || 'Untitled';
      // Extract first ~500 chars of markdown as summary
      const markdown = page.markdown || '';
      const summary = markdown.slice(0, 500).replace(/[#*\[\]]/g, '').trim();

      records.push({
        id: randomUUID(),
        title,
        source,
        source_url: pageUrl,
        published_at: new Date().toISOString(),
        summary,
        full_content: markdown,
        entities: [],
        sentiment: null,
        sentiment_score: null,
        sector_tags: [],
        macro_signals: [],
        analysis_status: 'pending',
        ingestion_source: 'api_fetch',
      });
      byUrl.set(pageUrl, true);
    }
  } catch (err) {
    console.error('Cloudflare crawl failed for', feed.url, err);
  }
  return records;
}

// --- Unified scraper --------------------------------------------------------

export async function scrapeFeeds() {
  const feeds = await getFeeds();
  if (!feeds.length) {
    return { added: 0 };
  }

  const existing = await getNewsItems();
  const byUrl = new Map(existing.map((n) => [n.source_url, true]));
  let added = 0;

  for (const feed of feeds) {
    let newRecords = [];
    if (feed.crawl_method === 'cloudflare' && isCloudflareConfigured()) {
      newRecords = await crawlWithCloudflare(feed, byUrl);
    } else {
      newRecords = await scrapeRssFeed(feed, byUrl);
    }
    for (const record of newRecords) {
      existing.push(record);
      added += 1;
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

