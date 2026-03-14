import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const PRICE_CACHE_FILE = path.join(DATA_DIR, 'prices.json');

const QUOTE_TTL_MS = 15 * 1000;
const HISTORY_TTL_MS = 15 * 60 * 1000;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readCache() {
  try {
    const raw = await fs.readFile(PRICE_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      quotes: parsed.quotes || {},
      history: parsed.history || {},
    };
  } catch {
    return { quotes: {}, history: {} };
  }
}

async function writeCache(cache) {
  await ensureDataDir();
  await fs.writeFile(PRICE_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getApiKey() {
  return String(process.env.FINNHUB_API_KEY || '').trim();
}

export function getPriceServiceStatus() {
  return {
    provider: 'finnhub',
    configured: getApiKey().length > 0,
    quote_ttl_ms: QUOTE_TTL_MS,
    history_ttl_ms: HISTORY_TTL_MS,
  };
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function isLikelyTickerSymbol(symbol) {
  return /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(String(symbol || ''));
}

async function fetchFinnhubJson(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY is not configured');
  }

  const url = new URL(`https://finnhub.io/api/v1/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('token', apiKey);

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Finnhub request failed: ${response.status} ${message}`.trim());
  }

  return response.json();
}

function mapQuote(symbol, payload) {
  const current = Number(payload?.c);
  const previousClose = Number(payload?.pc);
  const change = Number.isFinite(current) && Number.isFinite(previousClose)
    ? current - previousClose
    : 0;

  return {
    symbol,
    current: Number.isFinite(current) ? current : null,
    change,
    change_percent: Number.isFinite(previousClose) && previousClose !== 0
      ? (change / previousClose) * 100
      : null,
    high: Number.isFinite(Number(payload?.h)) ? Number(payload.h) : null,
    low: Number.isFinite(Number(payload?.l)) ? Number(payload.l) : null,
    open: Number.isFinite(Number(payload?.o)) ? Number(payload.o) : null,
    previous_close: Number.isFinite(previousClose) ? previousClose : null,
    timestamp: Number.isFinite(Number(payload?.t)) ? new Date(Number(payload.t) * 1000).toISOString() : new Date().toISOString(),
  };
}

export async function getQuote(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    throw new Error('symbol is required');
  }

  const cache = await readCache();
  const cached = cache.quotes[normalizedSymbol];
  if (cached && Date.now() - cached.fetched_at < QUOTE_TTL_MS) {
    return cached.data;
  }

  const payload = await fetchFinnhubJson('quote', { symbol: normalizedSymbol });
  const data = mapQuote(normalizedSymbol, payload);
  cache.quotes[normalizedSymbol] = { fetched_at: Date.now(), data };
  await writeCache(cache);
  return data;
}

export async function getQuotes(symbols) {
  const uniqueSymbols = [...new Set((symbols || []).map(normalizeSymbol).filter(Boolean))];
  const results = await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      try {
        return [symbol, await getQuote(symbol)];
      } catch (error) {
        return [symbol, { symbol, error: error.message }];
      }
    })
  );

  return Object.fromEntries(results);
}

export async function validateTradableSymbols(symbols) {
  const uniqueSymbols = [...new Set((symbols || []).map(normalizeSymbol).filter(Boolean))]
    .filter(isLikelyTickerSymbol);

  const outcomes = await Promise.all(uniqueSymbols.map(async (symbol) => {
    try {
      const search = await fetchFinnhubJson('search', { q: symbol });
      const exactMatches = Array.isArray(search?.result)
        ? search.result.filter((entry) => normalizeSymbol(entry?.symbol) === symbol)
        : [];

      const quote = await getQuote(symbol);
      const hasPrice = Number.isFinite(Number(quote?.current)) && Number(quote.current) > 0;
      const valid = exactMatches.length > 0 && hasPrice;

      return [symbol, {
        valid,
        symbol,
        reason: valid ? null : (!hasPrice ? 'No valid quote returned' : 'Symbol not found in Finnhub search'),
        quote,
      }];
    } catch (error) {
      return [symbol, {
        valid: false,
        symbol,
        reason: error?.message || 'Validation failed',
      }];
    }
  }));

  const records = Object.fromEntries(outcomes);
  const validSymbols = Object.values(records)
    .filter((entry) => entry.valid)
    .map((entry) => entry.symbol);

  return {
    requested: uniqueSymbols,
    valid_symbols: validSymbols,
    invalid_symbols: uniqueSymbols.filter((symbol) => !validSymbols.includes(symbol)),
    records,
  };
}

function mapCandles(symbol, payload) {
  if (payload?.s !== 'ok' || !Array.isArray(payload?.t) || !Array.isArray(payload?.c)) {
    return [];
  }

  const candles = [];
  for (let index = 0; index < payload.t.length; index += 1) {
    const timestamp = Number(payload.t[index]);
    const close = Number(payload.c[index]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;
    candles.push({
      symbol,
      timestamp: new Date(timestamp * 1000).toISOString(),
      open: Number.isFinite(Number(payload?.o?.[index])) ? Number(payload.o[index]) : close,
      high: Number.isFinite(Number(payload?.h?.[index])) ? Number(payload.h[index]) : close,
      low: Number.isFinite(Number(payload?.l?.[index])) ? Number(payload.l[index]) : close,
      close,
      volume: Number.isFinite(Number(payload?.v?.[index])) ? Number(payload.v[index]) : null,
    });
  }
  return candles;
}

export async function getHistoricalCandles(symbol, days = 30) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedDays = Math.max(2, Math.min(365, Number(days) || 30));
  if (!normalizedSymbol) {
    throw new Error('symbol is required');
  }

  const cacheKey = `${normalizedSymbol}:${normalizedDays}`;
  const cache = await readCache();
  const cached = cache.history[cacheKey];
  if (cached && Date.now() - cached.fetched_at < HISTORY_TTL_MS) {
    return cached.data;
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - normalizedDays * 24 * 60 * 60;
  const payload = await fetchFinnhubJson('stock/candle', {
    symbol: normalizedSymbol,
    resolution: 'D',
    from,
    to: now,
  });

  const data = mapCandles(normalizedSymbol, payload);
  cache.history[cacheKey] = { fetched_at: Date.now(), data };
  await writeCache(cache);
  return data;
}

export async function getHistoricalCandlesBatch(symbols, days = 30) {
  const uniqueSymbols = [...new Set((symbols || []).map(normalizeSymbol).filter(Boolean))];
  const results = await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      try {
        return [symbol, await getHistoricalCandles(symbol, days)];
      } catch (error) {
        return [symbol, { error: error.message, candles: [] }];
      }
    })
  );
  return Object.fromEntries(results);
}