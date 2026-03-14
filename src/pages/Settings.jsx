// Settings — feed management, LLM status, integrations.
import { useState, useEffect, useCallback } from "react";
import {
  Settings2, AlertTriangle, Shield, Lock, CheckCircle, XCircle,
  Rss, Trash2, Plus, RefreshCw, Cpu, ExternalLink, Loader2,
} from "lucide-react";

// --- Integration definitions (unchanged) ------------------------------------

const INTEGRATIONS = [
  {
    id: "live_market_data",
    name: "Live Market Data Feed",
    description: "Connect a real-time market data provider (e.g. Alpaca, Polygon.io, Yahoo Finance API) for live price feeds.",
    status: "disabled",
    warning: "Enabling live data does not activate any trading functionality. Price data is used for display and simulation calibration only. Requires your own API key from a third-party provider.",
    category: "Data",
    complexity: "Low",
  },
  {
    id: "brokerage_readonly",
    name: "Brokerage Read-Only (Portfolio Sync)",
    description: "Sync your actual portfolio positions in read-only mode for benchmarking against simulations.",
    status: "disabled",
    warning: "Read-only access only. This platform will never initiate trades or send orders to any brokerage. Requires review of your broker's API terms before enabling.",
    category: "Brokerage",
    complexity: "Medium",
  },
  {
    id: "alert_email",
    name: "Hypothesis Alert Notifications",
    description: "Receive email alerts when new high-confidence hypotheses are generated matching your watchlist.",
    status: "disabled",
    warning: "Alert notifications are informational only. They do not constitute financial advice or action triggers.",
    category: "Notifications",
    complexity: "Low",
  },
];

// --- Integration card (unchanged) -------------------------------------------

function IntegrationCard({ integration }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const statusConfig = {
    disabled: { label: "Disabled", cls: "text-zinc-500 bg-zinc-800 border-zinc-700" },
    planned: { label: "Planned", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    active: { label: "Active", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  };
  const sc = statusConfig[integration.status];

  return (
    <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-zinc-200">{integration.name}</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${sc.cls}`}>{sc.label}</span>
            <span className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{integration.category}</span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">{integration.description}</p>
        </div>
        <Lock className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
      </div>
      {showWarning && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3 mb-3">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/80 leading-relaxed">{integration.warning}</p>
          </div>
          {integration.status === "disabled" && (
            <label className="flex items-start gap-2 cursor-pointer">
              <div
                onClick={() => setAcknowledged(!acknowledged)}
                className={`w-3.5 h-3.5 mt-0.5 rounded border shrink-0 flex items-center justify-center ${
                  acknowledged ? "bg-blue-600 border-blue-600" : "border-zinc-600 bg-zinc-800"
                }`}
              >
                {acknowledged && (
                  <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-zinc-500">I understand the limitations and compliance requirements</p>
            </label>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        {integration.status === "disabled" && !showWarning && (
          <button onClick={() => setShowWarning(true)} className="text-xs text-zinc-500 hover:text-zinc-400 border border-zinc-700 rounded px-2.5 py-1.5 transition-colors">
            View activation requirements
          </button>
        )}
        {integration.status === "disabled" && showWarning && (
          <>
            <button onClick={() => { setShowWarning(false); setAcknowledged(false); }} className="text-xs text-zinc-500 hover:text-zinc-400 border border-zinc-700 rounded px-2.5 py-1.5 transition-colors">
              Cancel
            </button>
            <button disabled={!acknowledged} className="text-xs border rounded px-2.5 py-1.5 transition-colors disabled:text-zinc-600 disabled:border-zinc-700 text-zinc-400 border-zinc-600 hover:text-zinc-300 disabled:cursor-not-allowed">
              Activate (requires backend service)
            </button>
          </>
        )}
        {integration.status === "planned" && (
          <p className="text-xs text-zinc-600 italic">Available in a future backend service release</p>
        )}
      </div>
    </div>
  );
}

// --- Feed management section ------------------------------------------------

function FeedManagement() {
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendUp, setBackendUp] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);

  const fetchFeeds = useCallback(async () => {
    try {
      const res = await fetch("/api/feeds");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFeeds(data);
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeeds(); }, [fetchFeeds]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), name: newName.trim() || undefined }),
      });
      if (res.ok) {
        setNewUrl("");
        setNewName("");
        await fetchFeeds();
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/feeds/${encodeURIComponent(id)}`, { method: "DELETE" });
      await fetchFeeds();
    } catch { /* ignored */ }
  };

  const handleScrape = async () => {
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/scraper/run", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setScrapeResult(data);
      }
    } finally {
      setScraping(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading feeds...</div>
      </div>
    );
  }

  if (!backendUp) {
    return (
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Rss className="w-3.5 h-3.5" /> News Feeds
        </h2>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/80">Backend not reachable. Start the backend server to manage feeds and scrape news.</p>
          </div>
        </div>
      </div>
    );
  }

  const categories = [...new Set(feeds.map(f => f.category || "General"))];

  return (
    <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Rss className="w-3.5 h-3.5" /> News Feeds
          <span className="text-zinc-600 font-normal normal-case">({feeds.length} configured)</span>
        </h2>
        <button
          onClick={handleScrape}
          disabled={scraping || feeds.length === 0}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${scraping ? "animate-spin" : ""}`} />
          {scraping ? "Scraping..." : "Scrape Now"}
        </button>
      </div>

      {scrapeResult && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2.5 mb-4">
          <p className="text-xs text-emerald-300">Scrape complete — {scrapeResult.added} new article{scrapeResult.added !== 1 ? "s" : ""} added.</p>
        </div>
      )}

      {/* Add feed form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://example.com/feed.rss"
          required
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name (optional)"
          className="w-40 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={adding || !newUrl.trim()}
          className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded px-3 py-1.5 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </form>

      {/* Feed list by category */}
      {categories.sort().map(cat => {
        const catFeeds = feeds.filter(f => (f.category || "General") === cat);
        return (
          <div key={cat} className="mb-3">
            <p className="text-xs text-zinc-500 font-medium mb-1.5">{cat}</p>
            <div className="space-y-1">
              {catFeeds.map(feed => (
                <div key={feed.id} className="flex items-center gap-2 group px-2.5 py-1.5 rounded hover:bg-zinc-800/60 transition-colors">
                  <Rss className="w-3 h-3 text-zinc-600 shrink-0" />
                  <span className="text-xs text-zinc-300 flex-1 truncate">{feed.name}</span>
                  {feed.default && (
                    <span className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">default</span>
                  )}
                  <span className="text-xs text-zinc-600 truncate max-w-48 hidden md:inline">{feed.url}</span>
                  <button
                    onClick={() => handleDelete(feed.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                    title="Remove feed"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- LLM status section -----------------------------------------------------

function LLMStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetch("/api/llm/status")
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/llm/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Return a JSON object with a single key 'status' set to 'ok'.",
          response_json_schema: { type: "object", properties: { status: { type: "string" } } },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult({ success: true, data });
      } else {
        const err = await res.json().catch(() => ({}));
        setTestResult({ success: false, error: err.error || `HTTP ${res.status}` });
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking LLM...</div>
      </div>
    );
  }

  const providerLabel = {
    ollama: "Ollama (local)",
    openai: "OpenAI",
    none: "Not configured",
  };

  return (
    <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
      <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Cpu className="w-3.5 h-3.5" /> AI / LLM Provider
      </h2>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          {status?.available ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-500" />
          )}
          <span className="text-xs text-zinc-300">{providerLabel[status?.provider] || "Unknown"}</span>
        </div>
        {status?.model && (
          <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{status.model}</span>
        )}
      </div>

      {!status?.available && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3 mb-3">
          <p className="text-xs text-amber-200/80 leading-relaxed mb-2">
            No LLM provider detected. AI analysis and hypothesis generation will use placeholder data until configured.
          </p>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <p><strong className="text-zinc-300">Option 1 — Ollama (recommended, free):</strong></p>
            <ol className="list-decimal list-inside space-y-0.5 text-zinc-500 ml-2">
              <li>Install Ollama from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">ollama.com</a></li>
              <li>Run: <code className="bg-zinc-800 px-1 rounded">ollama pull qwen2.5:7b</code></li>
              <li>Restart the backend — Ollama will be auto-detected</li>
            </ol>
            <p className="mt-2"><strong className="text-zinc-300">Option 2 — OpenAI:</strong></p>
            <p className="text-zinc-500 ml-2">Set <code className="bg-zinc-800 px-1 rounded">OPENAI_API_KEY</code> in your <code className="bg-zinc-800 px-1 rounded">.env</code> file and restart the backend.</p>
          </div>
        </div>
      )}

      <button
        onClick={handleTest}
        disabled={testing || !status?.available}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
        {testing ? "Testing..." : "Test LLM Connection"}
      </button>

      {testResult && (
        <div className={`mt-2 rounded-md p-2.5 text-xs ${testResult.success ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-300" : "bg-red-500/5 border border-red-500/20 text-red-300"}`}>
          {testResult.success ? "LLM responded successfully." : `Error: ${testResult.error}`}
        </div>
      )}
    </div>
  );
}

// --- Main settings page -----------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-zinc-200 tracking-tight flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-zinc-400" />
          Platform Settings
        </h1>
        <p className="text-xs text-zinc-600 mt-0.5">Feed management, AI configuration, and optional integrations</p>
      </div>

      {/* LLM status */}
      <LLMStatus />

      {/* Feed management */}
      <FeedManagement />

      {/* System status */}
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Platform Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "News Intelligence", status: "active" },
            { label: "Hypothesis Engine", status: "active" },
            { label: "Portfolio Simulator", status: "active" },
            { label: "Audit Logging", status: "active" },
            { label: "RSS Feed Scraper", status: "active" },
            { label: "Live Market Data", status: "disabled" },
            { label: "Brokerage Integration", status: "disabled" },
            { label: "Order Execution", status: "never" },
          ].map(({ label, status }) => (
            <div key={label} className="flex items-center gap-2">
              {status === "active" ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : status === "never" ? (
                <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-zinc-600 shrink-0" />
              )}
              <span className={`text-xs ${status === "active" ? "text-zinc-300" : status === "never" ? "text-zinc-600 line-through" : "text-zinc-500"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-3 italic">
          Order execution is architecturally excluded from this platform — it is not planned and cannot be activated.
        </p>
      </div>

      {/* Compliance frame */}
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Regulatory Framework</h2>
        <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
          <p>This platform is designed as an <strong className="text-zinc-400">educational analytics and decision-support tool</strong>. It is not registered as an investment advisor, broker-dealer, or financial institution.</p>
          <p>All AI-generated outputs are framed as analytical signals, research hypotheses, and simulation results — never as advice, recommendations, or predictions.</p>
          <p>All optional integration modules that involve external financial data are disabled by default and require explicit user acknowledgment before activation.</p>
          <p>Order execution capabilities are architecturally excluded from the platform design and are not available through any configuration path.</p>
          <p className="text-zinc-600">System boundary: Analytics service ↔ Simulation engine are architecturally separated. Future execution capabilities, if ever introduced, must be deployed as a fully independent service with separate compliance review.</p>
        </div>
      </div>

      {/* Optional integrations */}
      <div>
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Optional Integrations</h2>
        <p className="text-xs text-zinc-600 mb-4">All integrations are disabled by default. Each requires explicit acknowledgment before activation. Most require backend service extensions.</p>
        <div className="space-y-3">
          {INTEGRATIONS.map(integration => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      </div>
    </div>
  );
}