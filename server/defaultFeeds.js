/**
 * Curated default financial RSS feeds — seeded on first run.
 * Users can add/remove feeds from the Settings UI.
 */
export const DEFAULT_FEEDS = [
  // --- Major financial news ---
  {
    name: 'Yahoo Finance — Top Stories',
    url: 'https://finance.yahoo.com/news/rssindex',
    category: 'General',
  },
  {
    name: 'Yahoo Finance — Stock Market',
    url: 'https://finance.yahoo.com/rss/topfinstories',
    category: 'Markets',
  },
  {
    name: 'CNBC — Top News',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    category: 'General',
  },
  {
    name: 'CNBC — Market Insider',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
    category: 'Markets',
  },
  {
    name: 'MarketWatch — Top Stories',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    category: 'General',
  },
  {
    name: 'MarketWatch — Market Pulse',
    url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/',
    category: 'Markets',
  },
  // --- Wire services / global ---
  {
    name: 'Reuters — Business',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+business&hl=en-US&gl=US&ceid=US:en',
    category: 'General',
  },
  // --- Sector & analysis ---
  {
    name: 'Seeking Alpha — Market News',
    url: 'https://seekingalpha.com/market_currents.xml',
    category: 'Analysis',
  },
  {
    name: 'Benzinga — News',
    url: 'https://www.benzinga.com/feed',
    category: 'General',
  },
  {
    name: 'Investing.com — Stock Market',
    url: 'https://www.investing.com/rss/news_301.rss',
    category: 'Markets',
  },
  {
    name: 'The Motley Fool — Stock Market',
    url: 'https://www.fool.com/feeds/index.aspx?id=foolwatch&format=rss2',
    category: 'Analysis',
  },
  // --- Google News finance topic ---
  {
    name: 'Google News — Business',
    url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
    category: 'General',
  },
  {
    name: 'Google News — Markets',
    url: 'https://news.google.com/rss/search?q=stock+market&hl=en-US&gl=US&ceid=US:en',
    category: 'Markets',
  },
  // --- Tech / growth ---
  {
    name: 'TechCrunch — Startups',
    url: 'https://techcrunch.com/category/startups/feed/',
    category: 'Tech',
  },
  // --- Macro / economics ---
  {
    name: 'Federal Reserve — Press Releases',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    category: 'Macro',
  },
];
