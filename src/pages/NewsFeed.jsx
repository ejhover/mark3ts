// News Intelligence Feed — core news ingestion and analysis view.
// Displays analyzed news with entity extraction, sentiment signals, and source attribution.
import { useState, useEffect, useCallback, useRef } from "react";
import { appClient } from "@/api/appClient";
import { Plus, RefreshCw, Filter, Search, Zap, ChevronLeft, ChevronRight as ChevronRightIcon, Loader2, Play, Pause, Square } from "lucide-react";
import NewsCard from "@/components/news/NewsCard";
import NewsDetailPanel from "@/components/news/NewsDetailPanel";
import IngestNewsModal from "@/components/news/IngestNewsModal";
import WatchlistPanel from "@/components/watchlist/WatchlistPanel";
import MarketOverviewBar from "@/components/dashboard/MarketOverviewBar";
import { getSignalStrength } from "@/lib/newsSignals";

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

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "strongest_signal", label: "Strongest signal" },
  { value: "strongest_bullish", label: "Strongest bullish" },
  { value: "strongest_bearish", label: "Strongest bearish" },
];

const ITEMS_PER_PAGE = 20;

export default function NewsFeed() {
  const [newsItems, setNewsItems] = useState([]);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [maintenanceStatus, setMaintenanceStatus] = useState({ active: null, recent: [] });
  const [maintenanceActionLoading, setMaintenanceActionLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState({ provider: "unknown", model: null, available: false });
  const hadActiveRunRef = useRef(false);

  const fetchData = async () => {
    setLoading(true);
    let news = [];
    const newsEndpoint = "/api/news";

    try {
      const res = await fetch(newsEndpoint);
      if (!res.ok) throw new Error(`News API error: ${res.status}`);
      news = await res.json();
    } catch (err) {
      console.error("Failed to load news from backend, falling back to local storage", err);
      news = appClient.entities.NewsItem.list("-created_date", 5000);
    }

    const watchlist = appClient.entities.WatchlistItem.list();
    setNewsItems(news);
    setWatchlistItems(watchlist);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const [runResponse, llmResponse] = await Promise.all([
        fetch("/api/news/maintenance/run"),
        fetch("/api/llm/status"),
      ]);

      if (llmResponse.ok) {
        const llm = await llmResponse.json();
        setLlmStatus({
          provider: llm?.provider || "unknown",
          model: llm?.model || null,
          available: Boolean(llm?.available),
        });
      }

      if (!runResponse.ok) return;
      const status = await runResponse.json();
      const hasActive = Boolean(status?.active);
      if (hadActiveRunRef.current && !hasActive) {
        fetchData();
      }
      hadActiveRunRef.current = hasActive;
      setMaintenanceStatus(status || { active: null, recent: [] });
    } catch {
      // Keep UI resilient if backend polling is temporarily unavailable.
    }
  }, []);

  const waitForNoActiveMaintenanceRun = useCallback(async (timeoutMs = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch("/api/news/maintenance/run");
        if (response.ok) {
          const status = await response.json();
          if (!status?.active) {
            setMaintenanceStatus(status || { active: null, recent: [] });
            return true;
          }
          setMaintenanceStatus(status || { active: null, recent: [] });
        }
      } catch {
        // Keep waiting through transient errors.
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    return false;
  }, []);

  useEffect(() => {
    fetchMaintenanceStatus();
    const timer = setInterval(fetchMaintenanceStatus, 2500);
    return () => clearInterval(timer);
  }, [fetchMaintenanceStatus]);

  const startAnalyzeAllUnanalyzed = useCallback(async () => {
    setMaintenanceActionLoading(true);
    try {
      const statusResponse = await fetch("/api/news/maintenance/run");
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        const active = status?.active;
        if (active && ["queued", "running", "paused"].includes(active.status)) {
          await fetch("/api/news/maintenance/run/stop", { method: "POST" });
          await waitForNoActiveMaintenanceRun();
        }
      }

      await fetch("/api/news/maintenance/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skipPrune: true,
          force: false,
          analyzeMinImportance: 0,
          batchSize: 1,
          maxBatches: 5000,
        }),
      });
      await fetchMaintenanceStatus();
    } finally {
      setMaintenanceActionLoading(false);
    }
  }, [fetchMaintenanceStatus, waitForNoActiveMaintenanceRun]);

  const pauseAnalyzeRun = useCallback(async () => {
    setMaintenanceActionLoading(true);
    try {
      await fetch("/api/news/maintenance/run/pause", { method: "POST" });
      await fetchMaintenanceStatus();
    } finally {
      setMaintenanceActionLoading(false);
    }
  }, [fetchMaintenanceStatus]);

  const resumeAnalyzeRun = useCallback(async () => {
    setMaintenanceActionLoading(true);
    try {
      await fetch("/api/news/maintenance/run/resume", { method: "POST" });
      await fetchMaintenanceStatus();
    } finally {
      setMaintenanceActionLoading(false);
    }
  }, [fetchMaintenanceStatus]);

  const stopAnalyzeRun = useCallback(async () => {
    setMaintenanceActionLoading(true);
    try {
      await fetch("/api/news/maintenance/run/stop", { method: "POST" });
      await fetchMaintenanceStatus();
    } finally {
      setMaintenanceActionLoading(false);
    }
  }, [fetchMaintenanceStatus]);

  // --- Analysis (manual per-item) ------------------------------------------

  const runAnalysis = useCallback(async (item) => {
    if (analyzingIds.has(item.id)) return;

    setAnalyzingIds(prev => new Set(prev).add(item.id));

    // Update local state to show analyzing spinner
    setNewsItems(prev => prev.map(n => n.id === item.id ? { ...n, analysis_status: "analyzing" } : n));

    const today = new Date().toISOString().split("T")[0];
    const prompt = `Today is ${today}. You are a financial news analyst. The user is running a LOCAL research tool; you do NOT have live market data, so base your analysis solely on the article content and general financial knowledge.

Title: ${item.title}
Source: ${item.source}
Content: ${(item.full_content || item.summary || item.title).slice(0, 2000)}

Return a JSON object with EXACTLY these keys:
- summary: One concise sentence describing the article's impact on related stocks.
- entities: Array of { name, type (company|ticker|sector|macro), ticker (if applicable) }
- sentiment: One of: bullish, bearish, neutral, mixed
- sentiment_score: Float from -1.0 (bearish) to 1.0 (bullish)
- sector_tags: Array of relevant market sectors (max 3)
- macro_signals: Array of macroeconomic signals (max 3)
- price_impact_estimate: A single short sentence estimating the likely short-term price direction for the primary ticker mentioned, or "N/A" if no specific ticker.

Be concise and explicit. No disclaimers, no filler text.`;

    try {
      const llmResponse = await fetch("/api/llm/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
            price_impact_estimate: { type: "string" },
          }
        }
      })
      });
      if (!llmResponse.ok) {
        const payload = await llmResponse.json().catch(() => ({}));
        throw new Error(payload.error || `LLM request failed: ${llmResponse.status}`);
      }
      const result = await llmResponse.json();

      const analysisData = {
        summary: result.summary,
        entities: result.entities || [],
        sentiment: result.sentiment,
        sentiment_score: result.sentiment_score,
        sector_tags: result.sector_tags || [],
        macro_signals: result.macro_signals || [],
        price_impact_estimate: result.price_impact_estimate || "",
        analysis_status: "complete",
      };

      // Persist to localStorage
      try {
        appClient.entities.NewsItem.update(item.id, analysisData);
      } catch {
        // item might only exist in backend JSON, that's fine
      }

      // Also persist to backend so the analysis is cached server-side
      try {
        await fetch("/api/news/" + item.id + "/analysis", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analysisData),
        });
      } catch {
        // endpoint might not exist yet, no problem
      }

      // Log analysis to audit trail
      appClient.entities.AuditLog.create({
        event_type: "analysis_run",
        entity_type: "NewsItem",
        entity_id: item.id,
        description: `AI analysis completed for: "${item.title}"`,
        ai_model_used: "InvokeLLM",
        input_summary: item.title,
        output_summary: `Sentiment: ${result.sentiment} (${result.sentiment_score}), Entities: ${(result.entities || []).length}`,
        sources_cited: item.source_url ? [item.source_url] : [],
      });

      setNewsItems(prev => prev.map(n => n.id === item.id ? { ...n, ...analysisData } : n));
      if (selectedItem?.id === item.id) setSelectedItem(prev => ({ ...prev, ...analysisData }));

    } catch (err) {
      console.error("Analysis failed for", item.id, err);
      setNewsItems(prev => prev.map(n => n.id === item.id ? { ...n, analysis_status: "pending" } : n));
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    }
  }, [analyzingIds, selectedItem]);

  // --- Auto-analyze current page -------------------------------------------

  const analyzeCurrentPage = useCallback(async () => {
    const pending = paginatedItems.filter(i => i.analysis_status !== "complete" && i.analysis_status !== "analyzing");
    if (pending.length === 0) return;
    setAutoAnalyzing(true);
    // Run sequentially to avoid hammering the LLM
    for (const item of pending) {
      await runAnalysis(item);
    }
    setAutoAnalyzing(false);
  }, [runAnalysis]);

  const handleIngested = (item) => {
    setNewsItems(prev => [item, ...prev]);
  };

  // --- Filter + Pagination logic -------------------------------------------

  const filteredItems = newsItems.filter(item => {
    const matchSearch = !searchQuery ||
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.entities || []).some(e => e.name?.toLowerCase().includes(searchQuery.toLowerCase()) || e.ticker?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchSentiment = sentimentFilter === "all" || item.sentiment === sentimentFilter;
    const matchStatus = statusFilter === "all" || item.analysis_status === statusFilter;
    return matchSearch && matchSentiment && matchStatus;
  });

  const sortedItems = [...filteredItems].sort((left, right) => {
    const leftPublished = left.published_at || left.created_date || "";
    const rightPublished = right.published_at || right.created_date || "";
    const leftScore = Number(left.sentiment_score) || 0;
    const rightScore = Number(right.sentiment_score) || 0;

    if (sortBy === "oldest") {
      return leftPublished < rightPublished ? -1 : leftPublished > rightPublished ? 1 : 0;
    }

    if (sortBy === "strongest_signal") {
      const delta = getSignalStrength(rightScore) - getSignalStrength(leftScore);
      if (delta !== 0) return delta;
    }

    if (sortBy === "strongest_bullish") {
      const leftBullish = leftScore > 0 ? leftScore : -1;
      const rightBullish = rightScore > 0 ? rightScore : -1;
      if (rightBullish !== leftBullish) return rightBullish - leftBullish;
    }

    if (sortBy === "strongest_bearish") {
      const leftBearish = leftScore < 0 ? Math.abs(leftScore) : -1;
      const rightBearish = rightScore < 0 ? Math.abs(rightScore) : -1;
      if (rightBearish !== leftBearish) return rightBearish - leftBearish;
    }

    return leftPublished < rightPublished ? 1 : leftPublished > rightPublished ? -1 : 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = sortedItems.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const pendingOnPage = paginatedItems.filter(i => i.analysis_status !== "complete" && i.analysis_status !== "analyzing").length;
  const activeRun = maintenanceStatus?.active;
  const runIsActive = activeRun && ["queued", "running", "paused"].includes(activeRun.status);
  const runTotals = activeRun?.analysis_totals || {};
  const runTargetTotal = Number(runTotals.target_total) || 0;
  const runProcessed = Number(runTotals.processed) || 0;
  const runProgressPct = runTargetTotal > 0
    ? Math.min(100, (runProcessed / runTargetTotal) * 100)
    : 0;

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, sentimentFilter, statusFilter, sortBy]);

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
      {runIsActive && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <p className="text-xs text-blue-200 font-medium">
                Background Analysis {activeRun.status === "paused" ? "Paused" : "Running"}
              </p>
              <p className="text-[11px] text-blue-200/70">
                {runProcessed} / {runTargetTotal || "?"} unanalyzed articles processed
              </p>
              <p className="text-[11px] text-blue-200/70 mt-0.5">
                Model: {llmStatus.provider || "unknown"}
                {llmStatus.model ? ` · ${llmStatus.model}` : ""}
                {llmStatus.available ? "" : " (unavailable)"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {activeRun.status === "paused" ? (
                <button
                  onClick={resumeAnalyzeRun}
                  disabled={maintenanceActionLoading}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white rounded"
                >
                  <Play className="w-3 h-3" /> Resume
                </button>
              ) : (
                <button
                  onClick={pauseAnalyzeRun}
                  disabled={maintenanceActionLoading}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] border border-blue-400/30 text-blue-200 hover:bg-blue-500/10 disabled:opacity-50 rounded"
                >
                  <Pause className="w-3 h-3" /> Pause
                </button>
              )}
              <button
                onClick={stopAnalyzeRun}
                disabled={maintenanceActionLoading}
                className="flex items-center gap-1 px-2 py-1 text-[11px] border border-red-400/30 text-red-300 hover:bg-red-500/10 disabled:opacity-50 rounded"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            </div>
          </div>
          <div className="w-full h-2 rounded bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${runProgressPct}%` }}
            />
          </div>
        </div>
      )}

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
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-blue-500"
        >
          {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span className="text-xs text-zinc-600 ml-1">{filteredItems.length} items</span>
      </div>

      {/* Auto-analyze + pagination bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={startAnalyzeAllUnanalyzed}
            disabled={maintenanceActionLoading || runIsActive}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-md transition-colors"
          >
            {maintenanceActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Analyze all unanalyzed (background)
          </button>
          <button
            onClick={analyzeCurrentPage}
            disabled={autoAnalyzing || pendingOnPage === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-md transition-colors"
          >
            {autoAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {autoAnalyzing ? "Analyzing page..." : `Analyze this page (${pendingOnPage} pending)`}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
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
          ) : paginatedItems.length === 0 ? (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-12 text-center">
              <Zap className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No news items found</p>
              <p className="text-xs text-zinc-600 mt-1">Add news items using the button above to begin analysis</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedItems.map(item => (
                <NewsCard
                  key={item.id}
                  item={item}
                  onClick={setSelectedItem}
                  onAnalyze={runAnalysis}
                  isAnalyzing={analyzingIds.has(item.id)}
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
              { label: "Pending", value: newsItems.filter(n => n.analysis_status !== "complete").length },
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
          analyzing={analyzingIds.has(selectedItem.id)}
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