// Watchlist panel — shows tracked tickers and relevant news count.
// Used in sidebar of news feed for quick context.
import { useState } from "react";
import { Plus, X, Eye, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function WatchlistPanel({ items, newsItems, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    await base44.entities.WatchlistItem.create({
      ticker: ticker.toUpperCase().trim(),
      company_name: company.trim(),
      sector: sector.trim(),
    });
    setTicker(""); setCompany(""); setSector("");
    setShowAdd(false);
    setLoading(false);
    onRefresh();
  };

  const handleDelete = async (id) => {
    await base44.entities.WatchlistItem.delete(id);
    onRefresh();
  };

  // Count relevant news for each watchlist item
  const getNewsCount = (item) => {
    return newsItems.filter(n =>
      (n.entities || []).some(e => e.ticker === item.ticker || e.name?.toLowerCase().includes(item.company_name?.toLowerCase()))
      || (n.title || "").toLowerCase().includes(item.ticker.toLowerCase())
    ).length;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700/60 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" /> Watchlist
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs text-zinc-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 space-y-1.5 p-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-md">
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            placeholder="Ticker (e.g. AAPL)"
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <input
            value={company}
            onChange={e => setCompany(e.target.value)}
            placeholder="Company name (optional)"
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
          />
          <input
            value={sector}
            onChange={e => setSector(e.target.value)}
            placeholder="Sector (optional)"
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
          />
          <div className="flex gap-1 pt-1">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-1 text-xs text-zinc-500 border border-zinc-600 rounded hover:bg-zinc-700 transition-colors"
            >Cancel</button>
            <button
              onClick={handleAdd}
              disabled={loading || !ticker.trim()}
              className="flex-1 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white rounded transition-colors"
            >Add</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-xs text-zinc-600 italic">No items tracked. Add a ticker to monitor.</p>
        )}
        {items.map(item => {
          const count = getNewsCount(item);
          return (
            <div key={item.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-blue-400 shrink-0">${item.ticker}</span>
                {item.company_name && (
                  <span className="text-xs text-zinc-500 truncate">{item.company_name}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <span className="text-xs text-zinc-400 bg-zinc-700 px-1.5 py-0.5 rounded font-mono">{count}</span>
                )}
                <button
                  onClick={() => handleDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}