import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { invokeLLM } from './llm.js';
import {
  getNewsItems,
  addNewsItem,
  getFeeds,
  addFeed,
  deleteFeed,
  scrapeFeeds,
  startScraperScheduler,
} from './newsStore.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- LLM proxy --------------------------------------------------------------

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
    const sorted = [...items].sort((a, b) => {
      const aDate = a.published_at || a.created_date || '';
      const bDate = b.published_at || b.created_date || '';
      return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
    });
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
    const { url, name } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }
    const feed = await addFeed(url, name);
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
    res.json(result);
  } catch (err) {
    console.error('Scraper run error', err);
    res.status(500).json({ error: 'Failed to run scraper' });
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

