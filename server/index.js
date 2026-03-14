import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { invokeLLM, getLLMStatus } from './llm.js';
import {
  getNewsItems,
  saveNewsItems,
  addNewsItem,
  updateNewsItem,
  getFeeds,
  addFeed,
  deleteFeed,
  scrapeFeeds,
  startScraperScheduler,
  getCloudflareStatus,
  getNewsStorageConfig,
  computeNewsImportance,
  pruneNewsItemsByImportance,
} from './newsStore.js';
import {
  getHistoricalCandlesBatch,
  getPriceServiceStatus,
  getQuote,
  getQuotes,
  validateTradableSymbols,
} from './priceStore.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

let activeMaintenanceRun = null;
const maintenanceRuns = [];
const FINNHUB_WEBHOOK_SECRET = String(process.env.FINNHUB_WEBHOOK_SECRET || '').trim();
const finnhubWebhookEvents = [];

const IMPACT_KEYWORDS = [
  'fda',
  'lawsuit',
  'antitrust',
  'guidance',
  'earnings',
  'merger',
  'acquisition',
  'bankruptcy',
  'rate cut',
  'rate hike',
  'tariff',
  'sanction',
  'downgrade',
  'upgrade',
  'default',
  'recall',
  'sec',
];

function normalize01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampSentimentScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function uniqStrings(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function normalizeTicker(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.\-]/g, '');
}

function isLikelyTickerSymbol(value) {
  return /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(String(value || ''));
}

function normalizeEntityType(value) {
  const type = String(value || '').toLowerCase();
  if (type === 'company' || type === 'ticker' || type === 'sector' || type === 'macro') return type;
  return 'company';
}

function buildSignalFacts(analysis) {
  const entities = Array.isArray(analysis?.entities) ? analysis.entities : [];
  const tickers = [];
  const seenTickers = new Set();

  for (const entity of entities) {
    const entityType = normalizeEntityType(entity?.type);
    const ticker = normalizeTicker(entity?.ticker || entity?.name);
    if (!ticker || !isLikelyTickerSymbol(ticker)) continue;
    if (entityType !== 'ticker' && ticker !== normalizeTicker(entity?.name)) continue;
    if (seenTickers.has(ticker)) continue;
    seenTickers.add(ticker);
    tickers.push({
      ticker,
      name: String(entity?.name || ticker).trim() || ticker,
      entity_type: entityType,
    });
  }

  const topics = [
    ...uniqStrings(analysis?.sector_tags).map((label) => ({ type: 'sector', label })),
    ...uniqStrings(analysis?.macro_signals).map((label) => ({ type: 'macro', label })),
  ];

  const events = uniqStrings(analysis?.impact_keywords || []).slice(0, 8);
  const primaryTicker = tickers.length ? tickers[0].ticker : null;

  return {
    extraction_version: 1,
    extracted_at: new Date().toISOString(),
    sentiment: analysis?.sentiment || 'neutral',
    sentiment_score: clampSentimentScore(analysis?.sentiment_score ?? 0),
    source_credibility_score: normalize01(analysis?.source_credibility_score ?? 0.6),
    uncertainty_score: normalize01(analysis?.uncertainty_score ?? 0.35),
    primary_ticker: primaryTicker,
    tickers,
    topics,
    events,
  };
}

function pickImpactKeywords(item) {
  const text = `${item?.title || ''} ${item?.summary || ''}`.toLowerCase();
  return IMPACT_KEYWORDS.filter((keyword) => text.includes(keyword)).slice(0, 6);
}

function rankForDeepPass(item) {
  const signalStrength = Math.abs(Number(item?.sentiment_score) || 0);
  const credibility = normalize01(item?.source_credibility_score, 0.55);
  const uncertainty = normalize01(item?.uncertainty_score, 0.35);
  const impactKeywordScore = Math.min(1, (Array.isArray(item?.impact_keywords) ? item.impact_keywords.length : 0) / 4);
  const importanceScore = normalize01(item?.importance_score, 0);
  return (
    signalStrength * 0.25 +
    credibility * 0.25 +
    uncertainty * 0.15 +
    impactKeywordScore * 0.2 +
    importanceScore * 0.15
  );
}

function itemPromptText(item, maxChars = 7000) {
  return String(item?.full_content || item?.summary || item?.title || '').slice(0, maxChars);
}

function buildFastPassPrompt(item) {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. You are doing FAST PASS triage for market-moving news.\n\n` +
    `Goal:\n` +
    `- Extract stock-relevant signal quickly from limited context\n` +
    `- Score source credibility and impact potential\n` +
    `- Decide if this article deserves expensive deep full-content analysis\n\n` +
    `Article title: ${item?.title || 'Untitled'}\n` +
    `Source: ${item?.source || 'Unknown'}\n` +
    `URL: ${item?.source_url || 'N/A'}\n` +
    `Snippet: ${itemPromptText(item, 2200)}\n\n` +
    `Return ONLY valid JSON with keys:\n` +
    `summary (string, concise),\n` +
    `entities (array of {name, type: company|ticker|sector|macro, ticker}),\n` +
    `sentiment (bullish|bearish|neutral|mixed),\n` +
    `sentiment_score (number -1..1),\n` +
    `sector_tags (string[]),\n` +
    `macro_signals (string[]),\n` +
    `price_impact_estimate (string),\n` +
    `source_credibility_score (number 0..1),\n` +
    `impact_keywords (string[]),\n` +
    `uncertainty_score (number 0..1),\n` +
    `deep_analysis_candidate (boolean),\n` +
    `deep_analysis_rationale (string).`;
}

function buildDeepPassPrompt(item, fastResult) {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. You are doing DEEP PASS market impact analysis using full article context.\n\n` +
    `Existing fast pass summary: ${fastResult?.summary || 'N/A'}\n` +
    `Existing fast pass sentiment: ${fastResult?.sentiment || 'neutral'} (${fastResult?.sentiment_score ?? 0})\n\n` +
    `Article title: ${item?.title || 'Untitled'}\n` +
    `Source: ${item?.source || 'Unknown'}\n` +
    `URL: ${item?.source_url || 'N/A'}\n` +
    `Full text:\n${itemPromptText(item, 12000)}\n\n` +
    `Return ONLY valid JSON with keys:\n` +
    `summary (string),\n` +
    `entities (array of {name, type: company|ticker|sector|macro, ticker}),\n` +
    `sentiment (bullish|bearish|neutral|mixed),\n` +
    `sentiment_score (number -1..1),\n` +
    `sector_tags (string[]),\n` +
    `macro_signals (string[]),\n` +
    `price_impact_estimate (string),\n` +
    `source_credibility_score (number 0..1),\n` +
    `impact_keywords (string[]),\n` +
    `uncertainty_score (number 0..1),\n` +
    `deep_analysis_rationale (string).`;
}

function normalizeAnalysisResult(raw, item, defaults = {}) {
  const sentiment = String(raw?.sentiment || defaults.sentiment || 'neutral').toLowerCase();
  const sentimentValue = ['bullish', 'bearish', 'neutral', 'mixed'].includes(sentiment) ? sentiment : 'neutral';

  const normalized = {
    summary: String(raw?.summary || defaults.summary || item?.summary || '').trim(),
    entities: Array.isArray(raw?.entities) ? raw.entities : (Array.isArray(defaults.entities) ? defaults.entities : []),
    sentiment: sentimentValue,
    sentiment_score: clampSentimentScore(raw?.sentiment_score ?? defaults.sentiment_score ?? 0),
    sector_tags: uniqStrings(raw?.sector_tags ?? defaults.sector_tags ?? []),
    macro_signals: uniqStrings(raw?.macro_signals ?? defaults.macro_signals ?? []),
    price_impact_estimate: String(raw?.price_impact_estimate || defaults.price_impact_estimate || 'N/A'),
    source_credibility_score: normalize01(raw?.source_credibility_score ?? defaults.source_credibility_score ?? 0.6),
    impact_keywords: uniqStrings(raw?.impact_keywords ?? defaults.impact_keywords ?? pickImpactKeywords(item)),
    uncertainty_score: normalize01(raw?.uncertainty_score ?? defaults.uncertainty_score ?? 0.35),
    deep_analysis_candidate: Boolean(raw?.deep_analysis_candidate ?? defaults.deep_analysis_candidate ?? false),
    deep_analysis_rationale: String(raw?.deep_analysis_rationale || defaults.deep_analysis_rationale || ''),
  };

  return {
    ...normalized,
    signal_facts: buildSignalFacts(normalized),
  };
}

async function runTwoPassAnalysis(options = {}) {
  const cfg = getNewsStorageConfig();
  const deepPassPercent = normalize01(options.deepPassPercent, cfg.deepPassPercent);
  const limit = Math.max(1, Number(options.limit) || 250);
  const force = Boolean(options.force);
  const minImportance = Number.isFinite(Number(options.minImportance))
    ? Math.max(0, Math.min(1, Number(options.minImportance)))
    : 0;

  const items = await getNewsItems();
  const byId = new Map(items.map((item) => [item.id, item]));

  const candidates = items
    .map((item) => {
      const importance = Number(item.importance_score);
      const resolvedImportance = Number.isFinite(importance)
        ? importance
        : computeNewsImportance(item, items).score;
      return { ...item, importance_score: resolvedImportance };
    })
    .filter((item) => {
      if (item.importance_score < minImportance) return false;
      if (force) return true;
      return item.analysis_status !== 'complete' && item.analysis_status !== 'analyzing';
    })
    .sort((left, right) => {
      if ((right.importance_score || 0) !== (left.importance_score || 0)) {
        return (right.importance_score || 0) - (left.importance_score || 0);
      }
      const l = Date.parse(left.published_at || '') || 0;
      const r = Date.parse(right.published_at || '') || 0;
      return r - l;
    })
    .slice(0, limit);

  if (candidates.length === 0) {
    return {
      queued: 0,
      fast_completed: 0,
      deep_completed: 0,
      failed: 0,
      deep_selected: 0,
      deep_pass_percent: deepPassPercent,
      min_importance: minImportance,
    };
  }

  let fastCompleted = 0;
  let deepCompleted = 0;
  let failed = 0;
  const deepPool = [];

  for (const candidate of candidates) {
    const target = byId.get(candidate.id);
    if (!target) continue;
    target.analysis_status = 'analyzing';
    try {
      const fastRaw = await invokeLLM({
        prompt: buildFastPassPrompt(candidate),
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            entities: { type: 'array', items: { type: 'object' } },
            sentiment: { type: 'string' },
            sentiment_score: { type: 'number' },
            sector_tags: { type: 'array', items: { type: 'string' } },
            macro_signals: { type: 'array', items: { type: 'string' } },
            price_impact_estimate: { type: 'string' },
            source_credibility_score: { type: 'number' },
            impact_keywords: { type: 'array', items: { type: 'string' } },
            uncertainty_score: { type: 'number' },
            deep_analysis_candidate: { type: 'boolean' },
            deep_analysis_rationale: { type: 'string' },
          },
        },
      });

      const fast = normalizeAnalysisResult(fastRaw, candidate);
      Object.assign(target, fast, {
        analysis_status: 'complete',
        fast_analysis_completed_at: new Date().toISOString(),
        last_analyzed_at: new Date().toISOString(),
      });
      fastCompleted += 1;
      deepPool.push(target);
    } catch (err) {
      target.analysis_status = 'error';
      target.analysis_error = String(err?.message || err || 'Fast analysis failed').slice(0, 500);
      failed += 1;
    }
  }

  const deepEligible = deepPool
    .filter((item) => item.deep_analysis_candidate)
    .sort((left, right) => rankForDeepPass(right) - rankForDeepPass(left));
  const deepSelectedCount = Math.min(
    deepEligible.length,
    Math.max(0, Math.floor(candidates.length * deepPassPercent))
  );
  const deepSelected = deepEligible.slice(0, deepSelectedCount);

  for (const target of deepSelected) {
    try {
      const deepRaw = await invokeLLM({
        prompt: buildDeepPassPrompt(target, target),
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            entities: { type: 'array', items: { type: 'object' } },
            sentiment: { type: 'string' },
            sentiment_score: { type: 'number' },
            sector_tags: { type: 'array', items: { type: 'string' } },
            macro_signals: { type: 'array', items: { type: 'string' } },
            price_impact_estimate: { type: 'string' },
            source_credibility_score: { type: 'number' },
            impact_keywords: { type: 'array', items: { type: 'string' } },
            uncertainty_score: { type: 'number' },
            deep_analysis_rationale: { type: 'string' },
          },
        },
      });

      const deep = normalizeAnalysisResult(deepRaw, target, target);
      Object.assign(target, deep, {
        analysis_status: 'complete',
        deep_analysis_completed_at: new Date().toISOString(),
        last_analyzed_at: new Date().toISOString(),
      });
      deepCompleted += 1;
    } catch (err) {
      target.analysis_status = 'error';
      target.analysis_error = String(err?.message || err || 'Deep analysis failed').slice(0, 500);
      failed += 1;
    }
  }

  const merged = items.map((item) => {
    const maybeUpdated = byId.get(item.id) || item;
    const importance = computeNewsImportance(maybeUpdated, items);
    return {
      ...maybeUpdated,
      importance_score: importance.score,
      importance_breakdown: importance.breakdown,
      novelty_score: maybeUpdated.novelty_score ?? importance.breakdown.novelty,
      source_credibility_score: maybeUpdated.source_credibility_score ?? importance.breakdown.source_credibility,
      last_importance_scored_at: new Date().toISOString(),
    };
  });

  await saveNewsItems(merged);

  return {
    queued: candidates.length,
    fast_completed: fastCompleted,
    deep_completed: deepCompleted,
    failed,
    deep_selected: deepSelected.length,
    deep_pass_percent: deepPassPercent,
    min_importance: minImportance,
  };
}

async function runPruneAndAnalyze(options = {}) {
  const prune = await pruneNewsItemsByImportance({
    maxActiveItems: options.maxActiveItems,
    archiveEnabled: options.archiveEnabled,
    importanceFloor: options.pruneImportanceFloor,
  });

  const analyze = await runTwoPassAnalysis({
    limit: options.limit,
    force: options.force,
    minImportance: options.analyzeMinImportance,
    deepPassPercent: options.deepPassPercent,
  });

  return { prune, analyze };
}

async function estimateRunTargetTotal(options = {}) {
  const minImportance = Number.isFinite(Number(options.analyzeMinImportance))
    ? Math.max(0, Math.min(1, Number(options.analyzeMinImportance)))
    : 0;
  const force = Boolean(options.force);
  const items = await getNewsItems();

  let count = 0;
  for (const item of items) {
    const importance = Number(item.importance_score);
    const resolvedImportance = Number.isFinite(importance)
      ? importance
      : computeNewsImportance(item, items).score;
    if (resolvedImportance < minImportance) continue;
    if (!force && (item.analysis_status === 'complete' || item.analysis_status === 'analyzing')) continue;
    count += 1;
  }

  return count;
}

async function waitForRunResumeOrStop(run) {
  while (run.control.pauseRequested && !run.control.stopRequested) {
    run.status = 'paused';
    await sleep(1000);
  }
  if (!run.control.stopRequested && run.status === 'paused') {
    run.status = 'running';
  }
}

async function executeMaintenanceRun(run) {
  run.status = 'running';
  run.started_at = new Date().toISOString();

  try {
    run.analysis_totals.target_total = await estimateRunTargetTotal(run.options);

    if (!run.options.skipPrune) {
      run.prune = await pruneNewsItemsByImportance({
        maxActiveItems: run.options.maxActiveItems,
        archiveEnabled: run.options.archiveEnabled,
        importanceFloor: run.options.pruneImportanceFloor,
      });
    } else {
      run.prune = {
        skipped: true,
        reason: 'skipPrune option enabled',
      };
    }

    let batchIndex = 0;
    while (batchIndex < run.options.maxBatches) {
      if (run.control.stopRequested) {
        run.status = 'stopped';
        break;
      }

      if (run.control.pauseRequested) {
        await waitForRunResumeOrStop(run);
      }

      if (run.control.stopRequested) {
        run.status = 'stopped';
        break;
      }

      batchIndex += 1;
      const batch = await runTwoPassAnalysis({
        limit: run.options.batchSize,
        force: run.options.force,
        minImportance: run.options.analyzeMinImportance,
        deepPassPercent: run.options.deepPassPercent,
      });

      run.batches.push({ index: batchIndex, ...batch });
      run.analysis_totals.queued += Number(batch.queued || 0);
      run.analysis_totals.processed += Number(batch.queued || 0);
      run.analysis_totals.fast_completed += Number(batch.fast_completed || 0);
      run.analysis_totals.deep_completed += Number(batch.deep_completed || 0);
      run.analysis_totals.failed += Number(batch.failed || 0);

      if (Number(batch.queued || 0) === 0) break;
      if (
        Number(batch.fast_completed || 0) === 0 &&
        Number(batch.deep_completed || 0) === 0 &&
        Number(batch.failed || 0) === 0
      ) {
        break;
      }
    }

    if (run.status !== 'stopped') {
      run.status = 'complete';
    }
    run.finished_at = new Date().toISOString();
  } catch (err) {
    run.status = 'error';
    run.finished_at = new Date().toISOString();
    run.error = String(err?.message || err || 'maintenance run failed');
  } finally {
    activeMaintenanceRun = null;
  }
}

function startMaintenanceRun(options = {}) {
  if (activeMaintenanceRun?.status === 'running' || activeMaintenanceRun?.status === 'paused') {
    return activeMaintenanceRun;
  }

  const cfg = getNewsStorageConfig();
  const run = {
    id: randomUUID(),
    status: 'queued',
    started_at: null,
    finished_at: null,
    options: {
      maxActiveItems: Number(options.maxActiveItems) || cfg.maxActiveItems,
      archiveEnabled: options.archiveEnabled === undefined ? cfg.archiveEnabled : Boolean(options.archiveEnabled),
      pruneImportanceFloor: Number.isFinite(Number(options.pruneImportanceFloor)) ? Number(options.pruneImportanceFloor) : null,
      analyzeMinImportance: Number.isFinite(Number(options.analyzeMinImportance)) ? Number(options.analyzeMinImportance) : 0.35,
      deepPassPercent: normalize01(options.deepPassPercent, cfg.deepPassPercent),
      batchSize: Math.max(1, Number(options.batchSize) || 8),
      maxBatches: Math.max(1, Number(options.maxBatches) || 500),
      force: Boolean(options.force),
      skipPrune: Boolean(options.skipPrune),
    },
    control: {
      pauseRequested: false,
      stopRequested: false,
    },
    prune: null,
    batches: [],
    analysis_totals: {
      target_total: 0,
      queued: 0,
      processed: 0,
      fast_completed: 0,
      deep_completed: 0,
      failed: 0,
    },
    error: null,
  };

  maintenanceRuns.unshift(run);
  if (maintenanceRuns.length > 20) {
    maintenanceRuns.length = 20;
  }

  activeMaintenanceRun = run;
  executeMaintenanceRun(run).catch((err) => {
    run.status = 'error';
    run.finished_at = new Date().toISOString();
    run.error = String(err?.message || err || 'maintenance run failed');
    activeMaintenanceRun = null;
  });

  return run;
}

// --- LLM proxy --------------------------------------------------------------

app.get('/api/llm/status', async (_req, res) => {
  try {
    const status = await getLLMStatus();
    res.json(status);
  } catch (err) {
    console.error('LLM status error', err);
    res.json({ provider: 'none', model: null, available: false });
  }
});

app.post('/api/llm/invoke', async (req, res) => {
  try {
    const { prompt, response_json_schema } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const result = await invokeLLM({ prompt, response_json_schema });
    res.json(result);
  } catch (err) {
    console.error('LLM invoke error', err);
    res.status(500).json({ error: err.message || 'LLM invocation failed' });
  }
});

// --- News API ---------------------------------------------------------------

app.get('/api/news', async (_req, res) => {
  try {
    const items = await getNewsItems();
    const now = new Date();
    // Filter out any articles with future timestamps, clamp to now during sort
    const items_clamped = items.map(i => {
      if (i.published_at && new Date(i.published_at) > now) {
        return { ...i, published_at: now.toISOString() };
      }
      return i;
    });
    const sorted = items_clamped.sort((a, b) => {
      const aDate = a.published_at || a.created_date || '';
      const bDate = b.published_at || b.created_date || '';
      return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
    });
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(sorted);
  } catch (err) {
    console.error('Get news error', err);
    res.status(500).json({ error: 'Failed to load news' });
  }
});

app.post('/api/news', async (req, res) => {
  try {
    const news = await addNewsItem(req.body || {});
    res.status(201).json(news);
  } catch (err) {
    console.error('Add news error', err);
    res.status(500).json({ error: err.message || 'Failed to add news' });
  }
});

// Save analysis results for a news item (caching)
app.put('/api/news/:id/analysis', async (req, res) => {
  try {
    const updated = await updateNewsItem(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    console.error('Update news analysis error', err);
    res.status(500).json({ error: err.message || 'Failed to update news analysis' });
  }
});

// --- Feeds API --------------------------------------------------------------

app.get('/api/feeds', async (_req, res) => {
  try {
    const feeds = await getFeeds();
    res.json(feeds);
  } catch (err) {
    console.error('Get feeds error', err);
    res.status(500).json({ error: 'Failed to load feeds' });
  }
});

app.post('/api/feeds', async (req, res) => {
  try {
    const { url, name, category, crawl_method } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }
    const feed = await addFeed(url, name, category, crawl_method);
    res.status(201).json(feed);
  } catch (err) {
    console.error('Add feed error', err);
    res.status(500).json({ error: err.message || 'Failed to add feed' });
  }
});

app.delete('/api/feeds/:id', async (req, res) => {
  try {
    await deleteFeed(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('Delete feed error', err);
    res.status(500).json({ error: 'Failed to delete feed' });
  }
});

// --- Scraper trigger --------------------------------------------------------

app.post('/api/scraper/run', async (_req, res) => {
  try {
    const result = await scrapeFeeds();
    // Kick off maintenance asynchronously so manual ingestion starts analysis quickly.
    startMaintenanceRun({ batchSize: 20, maxBatches: 10, force: false });
    res.json(result);
  } catch (err) {
    console.error('Scraper run error', err);
    res.status(500).json({ error: 'Failed to run scraper' });
  }
});

// --- Prices API -------------------------------------------------------------

app.get('/api/prices/status', (_req, res) => {
  const priceStatus = getPriceServiceStatus();
  res.json({
    ...priceStatus,
    webhook_configured: FINNHUB_WEBHOOK_SECRET.length > 0,
    webhook_endpoint: '/api/finnhub/webhook',
    webhook_recent_events: finnhubWebhookEvents,
  });
});

app.post('/api/finnhub/webhook', (req, res) => {
  const providedSecret = String(req.header('X-Finnhub-Secret') || '').trim();
  if (!FINNHUB_WEBHOOK_SECRET || providedSecret !== FINNHUB_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Invalid Finnhub webhook secret' });
  }

  // Acknowledge immediately to avoid provider timeout retries.
  res.status(204).end();

  setImmediate(() => {
    try {
      finnhubWebhookEvents.unshift({
        received_at: new Date().toISOString(),
        event_type: req.body?.type || req.body?.event || 'unknown',
        symbol: req.body?.symbol || req.body?.data?.symbol || null,
      });
      if (finnhubWebhookEvents.length > 50) {
        finnhubWebhookEvents.length = 50;
      }
    } catch (err) {
      console.error('Finnhub webhook post-ack processing failed', err);
    }
  });
});

app.get('/api/prices/quote/:symbol', async (req, res) => {
  try {
    const quote = await getQuote(req.params.symbol);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(quote);
  } catch (err) {
    console.error('Price quote error', err);
    res.status(500).json({ error: err.message || 'Failed to load quote' });
  }
});

app.get('/api/prices/quotes', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (symbols.length === 0) {
      return res.status(400).json({ error: 'symbols query parameter is required' });
    }

    const quotes = await getQuotes(symbols);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ quotes, as_of: new Date().toISOString() });
  } catch (err) {
    console.error('Batch quote error', err);
    res.status(500).json({ error: err.message || 'Failed to load quotes' });
  }
});

app.get('/api/prices/validate', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (symbols.length === 0) {
      return res.status(400).json({ error: 'symbols query parameter is required' });
    }

    const validation = await validateTradableSymbols(symbols);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(validation);
  } catch (err) {
    console.error('Price symbol validation error', err);
    res.status(500).json({ error: err.message || 'Failed to validate symbols' });
  }
});

app.get('/api/prices/history', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const days = Number(req.query.days) || 30;

    if (symbols.length === 0) {
      return res.status(400).json({ error: 'symbols query parameter is required' });
    }

    const history = await getHistoricalCandlesBatch(symbols, days);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ history, as_of: new Date().toISOString(), days });
  } catch (err) {
    console.error('Price history error', err);
    res.status(500).json({ error: err.message || 'Failed to load price history' });
  }
});

app.get('/api/prices/stream', async (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const intervalMs = Math.max(15000, Math.min(60000, Number(req.query.interval_ms) || 30000));

  if (symbols.length === 0) {
    return res.status(400).json({ error: 'symbols query parameter is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendQuotes = async () => {
    try {
      const quotes = await getQuotes(symbols);
      res.write(`data: ${JSON.stringify({ quotes, as_of: new Date().toISOString() })}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Failed to stream quotes' })}\n\n`);
    }
  };

  await sendQuotes();
  const timer = setInterval(sendQuotes, intervalMs);

  req.on('close', () => {
    clearInterval(timer);
    res.end();
  });
});

// --- Settings status --------------------------------------------------------

app.get('/api/settings/status', async (_req, res) => {
  try {
    const llm = await getLLMStatus();
    const cloudflare = getCloudflareStatus();
    const prices = {
      ...getPriceServiceStatus(),
      webhook_configured: FINNHUB_WEBHOOK_SECRET.length > 0,
      webhook_endpoint: '/api/finnhub/webhook',
    };
    const news = getNewsStorageConfig();
    res.json({ llm, cloudflare, prices, news });
  } catch (err) {
    console.error('Settings status error', err);
    res.json({
      llm: { provider: 'none', model: null, available: false },
      cloudflare: { configured: false },
      prices: {
        provider: 'finnhub',
        configured: false,
        webhook_configured: FINNHUB_WEBHOOK_SECRET.length > 0,
        webhook_endpoint: '/api/finnhub/webhook',
      },
      news: getNewsStorageConfig(),
    });
  }
});

app.post('/api/news/maintenance/prune', async (req, res) => {
  try {
    const result = await pruneNewsItemsByImportance(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('News prune failed', err);
    res.status(500).json({ error: err.message || 'Failed to prune news' });
  }
});

app.post('/api/news/maintenance/analyze', async (req, res) => {
  try {
    const result = await runTwoPassAnalysis(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('News analyze failed', err);
    res.status(500).json({ error: err.message || 'Failed to analyze news' });
  }
});

app.post('/api/news/maintenance/prune-and-analyze', async (req, res) => {
  try {
    const result = await runPruneAndAnalyze(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('News prune-and-analyze failed', err);
    res.status(500).json({ error: err.message || 'Failed to prune and analyze news' });
  }
});

app.post('/api/news/maintenance/run', async (req, res) => {
  try {
    const run = startMaintenanceRun(req.body || {});
    res.status(202).json({
      id: run.id,
      status: run.status,
      started_at: run.started_at,
      options: run.options,
    });
  } catch (err) {
    console.error('Start maintenance run failed', err);
    res.status(500).json({ error: err.message || 'Failed to start maintenance run' });
  }
});

app.post('/api/news/maintenance/run/pause', async (_req, res) => {
  try {
    if (!activeMaintenanceRun || (activeMaintenanceRun.status !== 'running' && activeMaintenanceRun.status !== 'paused')) {
      return res.status(409).json({ error: 'No active maintenance run to pause' });
    }
    activeMaintenanceRun.control.pauseRequested = true;
    activeMaintenanceRun.status = 'paused';
    res.json({ id: activeMaintenanceRun.id, status: activeMaintenanceRun.status });
  } catch (err) {
    console.error('Pause maintenance run failed', err);
    res.status(500).json({ error: err.message || 'Failed to pause maintenance run' });
  }
});

app.post('/api/news/maintenance/run/resume', async (_req, res) => {
  try {
    if (!activeMaintenanceRun || (activeMaintenanceRun.status !== 'running' && activeMaintenanceRun.status !== 'paused')) {
      return res.status(409).json({ error: 'No active maintenance run to resume' });
    }
    activeMaintenanceRun.control.pauseRequested = false;
    activeMaintenanceRun.status = 'running';
    res.json({ id: activeMaintenanceRun.id, status: activeMaintenanceRun.status });
  } catch (err) {
    console.error('Resume maintenance run failed', err);
    res.status(500).json({ error: err.message || 'Failed to resume maintenance run' });
  }
});

app.post('/api/news/maintenance/run/stop', async (_req, res) => {
  try {
    if (!activeMaintenanceRun || (activeMaintenanceRun.status !== 'running' && activeMaintenanceRun.status !== 'paused')) {
      return res.status(409).json({ error: 'No active maintenance run to stop' });
    }
    activeMaintenanceRun.control.stopRequested = true;
    activeMaintenanceRun.control.pauseRequested = false;
    res.json({ id: activeMaintenanceRun.id, status: 'stopping' });
  } catch (err) {
    console.error('Stop maintenance run failed', err);
    res.status(500).json({ error: err.message || 'Failed to stop maintenance run' });
  }
});

app.get('/api/news/maintenance/run', async (_req, res) => {
  try {
    res.json({
      active: activeMaintenanceRun,
      recent: maintenanceRuns,
    });
  } catch (err) {
    console.error('Get maintenance run status failed', err);
    res.status(500).json({ error: err.message || 'Failed to get maintenance run status' });
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

// Kick off initial scrape and scheduler (best-effort; errors are logged only)
scrapeFeeds().catch((err) => {
  console.error('Initial scrape failed', err);
});
startScraperScheduler();

const analysisIntervalMs = Math.max(
  60_000,
  Number(process.env.NEWS_ANALYSIS_INTERVAL_MS || '') || 5 * 60 * 1000
);

setInterval(() => {
  startMaintenanceRun({
    batchSize: Number(process.env.NEWS_ANALYSIS_BATCH_LIMIT || '') || 8,
    force: false,
    analyzeMinImportance: Number(process.env.NEWS_ANALYZE_MIN_IMPORTANCE || '') || 0.35,
    maxBatches: Number(process.env.NEWS_ANALYSIS_MAX_BATCHES || '') || 25,
  });
}, analysisIntervalMs);

startMaintenanceRun({
  batchSize: Number(process.env.NEWS_ANALYSIS_BATCH_LIMIT || '') || 8,
  force: false,
  analyzeMinImportance: Number(process.env.NEWS_ANALYZE_MIN_IMPORTANCE || '') || 0.35,
  maxBatches: Number(process.env.NEWS_ANALYSIS_MAX_BATCHES || '') || 25,
});

