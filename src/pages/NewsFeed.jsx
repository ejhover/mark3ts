// News Intelligence Feed — core news ingestion and analysis view.
// Displays analyzed news with entity extraction, sentiment signals, and source attribution.
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, RefreshCw, Filter, Search, Zap } from "lucide-react";
import NewsCard from "@/components/news/NewsCard";
import NewsDetailPanel from "@/components/news/NewsDetailPanel";
import IngestNewsModal from "@/components/news/IngestNewsModal";
import WatchlistPanel from "@/components/watchlist/WatchlistPanel";
import MarketOverviewBar from "@/components/dashboard/MarketOverviewBar";

const SENTIMENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "bullish", label: "Bullish" },
  { value: "bearish", label: "Bearish" },
  { value: "neutral", label: "Neutral" },
  { value: "mixed", label: "Mixed" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All Status" },
  { value: "complete", label: "Analyzed" },
  { value: "pending", label: "Pending" },
];

export default function NewsFeed() {
  const [newsItems, setNewsItems] = useState([]);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchData = async () => {
    setLoading(true);

    let news = [];
    const apiBase = (import.meta.env.VITE_API_URL || "").trim();
    const newsEndpoint = apiBase ? `${apiBase.replace(/\/$/, "")}/api/news` : "/api/news";

    try {
      const res = await fetch(newsEndpoint);
      if (!res.ok) {
        throw new Error(`News API error: ${res.status}`);
      }
      news = await res.json();
    } catch (err) {
      console.error("Failed to load news from backend, falling back to local storage", err);
      news = await base44.entities.NewsItem.list("-created_date", 50);
    }

    const watchlist = await base44.entities.WatchlistItem.list();

    setNewsItems(news);
    setWatchlistItems(watchlist);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // AI analysis pipeline for a single news item
  const runAnalysis = async (item) => {
    setAnalyzing(true);
    await base44.entities.NewsItem.update(item.id, { analysis_status: "analyzing" });

    const prompt = `You are a financial news analyst. Analyze this news item for research purposes only.

Title: ${item.title}
Source: ${item.source}
Content: ${item.full_content || item.summary || item.title}

Extract and return a JSON with:
- summary: A concise 2-sentence summary of the article
- entities: Array of objects with { name, type (one of: company/ticker/sector/macro), ticker (if applicable) }
- sentiment: One of: bullish, bearish, neutral, mixed — as an analytical signal, not a recommendation
- sentiment_score: Float from -1.0 (most bearish) to 1.0 (most bullish)
- sector_tags: Array of relevant market sectors (e.g. "Technology", "Energy", "Healthcare")
- macro_signals: Array of macroeconomic signals detected (e.g. "interest rate sensitivity", "inflation hedge")

Be precise and cite only what is clearly implied by the article. Label all signals as analytical indicators.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          entities: { type: "array", items: { type: "object" } },
          sentiment: { type: "string" },
          sentiment_score: { type: "number" },
          sector_tags: { type: "array", items: { type: "string" } },
          macro_signals: { type: "array", items: { type: "string" } },
        }
      }
    });

    const updated = await base44.entities.NewsItem.update(item.id, {
      summary: result.summary,
      entities: result.entities || [],
      sentiment: result.sentiment,
      sentiment_score: result.sentiment_score,
      sector_tags: result.sector_tags || [],
      macro_signals: result.macro_signals || [],
      analysis_status: "complete",
    });

    // Log analysis to audit trail
    await base44.entities.AuditLog.create({
      event_type: "analysis_run",
      entity_type: "NewsItem",
      entity_id: item.id,
      description: `AI analysis completed for: "${item.title}"`,
      ai_model_used: "InvokeLLM",
      input_summary: item.title,
      output_summary: `Sentiment: ${result.sentiment} (${result.sentiment_score}), Entities: ${(result.entities || []).length}`,
      sources_cited: item.source_url ? [item.source_url] : [],
    });

    setNewsItems(prev => prev.map(n => n.id === item.id ? { ...n, ...updated } : n));
    if (selectedItem?.id === item.id) setSelectedItem({ ...selectedItem, ...updated });
    setAnalyzing(false);
  };

  const handleIngested = (item) => {
    setNewsItems(prev => [item, ...prev]);
  };

  // Filter logic
  const filteredItems = newsItems.filter(item => {
    const matchSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.entities || []).some(e => e.name?.toLowerCase().includes(searchQuery.toLowerCase()) || e.ticker?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchSentiment = sentimentFilter === "all" || item.sentiment === sentimentFilter;
    const matchStatus = statusFilter === "all" || item.analysis_status === statusFilter;
    return matchSearch && matchSentiment && matchStatus;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-zinc-200 tracking-tight">News Intelligence Feed</h1>
          <p className="text-xs text-zinc-600 mt-0.5">Analytical signals extracted from public news sources — research use only</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowIngestModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add News Item
          </button>
        </div>
      </div>

      {/* Market overview bar */}
      <MarketOverviewBar newsItems={newsItems} />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by title, source, entity..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-600" />
          {SENTIMENT_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setSentimentFilter(f.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sentimentFilter === f.value
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-blue-500"
        >
          {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span className="text-xs text-zinc-600 ml-1">{filteredItems.length} items</span>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* News feed — 3/4 width */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="border border-zinc-700/60 bg-zinc-900 rounded-md p-4 animate-pulse">
                  <div className="h-3 bg-zinc-800 rounded w-24 mb-2" />
                  <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-zinc-800 rounded w-full" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-12 text-center">
              <Zap className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No news items found</p>
              <p className="text-xs text-zinc-600 mt-1">Add news items using the button above to begin analysis</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => (
                <NewsCard
                  key={item.id}
                  item={item}
                  onClick={setSelectedItem}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar — 1/4 width */}
        <div className="lg:col-span-1 space-y-4">
          <WatchlistPanel
            items={watchlistItems}
            newsItems={newsItems}
            onRefresh={fetchData}
          />

          {/* Quick stats */}
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-md p-4 space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Feed Statistics</h3>
            {[
              { label: "Total items", value: newsItems.length },
              { label: "Analyzed", value: newsItems.filter(n => n.analysis_status === "complete").length },
              { label: "Pending", value: newsItems.filter(n => n.analysis_status === "pending").length },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-xs font-mono text-zinc-300">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals & panels */}
      {selectedItem && (
        <NewsDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAnalyze={runAnalysis}
          analyzing={analyzing}
        />
      )}
      {showIngestModal && (
        <IngestNewsModal
          onClose={() => setShowIngestModal(false)}
          onIngested={handleIngested}
        />
      )}
    </div>
  );
}