// Top-of-dashboard market context bar.
// Shows aggregated sentiment signal from news feed — analytical indicator only.
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

export default function MarketOverviewBar({ newsItems }) {
  const analyzed = newsItems.filter(n => n.analysis_status === "complete" && n.sentiment);
  const bullish = analyzed.filter(n => n.sentiment === "bullish").length;
  const bearish = analyzed.filter(n => n.sentiment === "bearish").length;
  const neutral = analyzed.filter(n => ["neutral", "mixed"].includes(n.sentiment)).length;
  const total = analyzed.length;

  const bullishPct = total ? Math.round((bullish / total) * 100) : 0;
  const bearishPct = total ? Math.round((bearish / total) * 100) : 0;
  const neutralPct = total ? Math.round((neutral / total) * 100) : 0;

  const overallSignal = bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral";

  const sectorCounts = {};
  newsItems.forEach(n => (n.sector_tags || []).forEach(s => {
    sectorCounts[s] = (sectorCounts[s] || 0) + 1;
  }));
  const topSectors = Object.entries(sectorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([s]) => s);

  return (
    <div className="border border-zinc-700/60 bg-zinc-900 rounded-md px-4 py-3 flex flex-wrap items-center gap-6">
      {/* Sentiment aggregate */}
      <div className="flex items-center gap-3">
        <Activity className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-500">Feed Sentiment Signal</span>
        {total > 0 ? (
          <div className="flex items-center gap-2">
            {overallSignal === "bullish" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
            {overallSignal === "bearish" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            {overallSignal === "neutral" && <Minus className="w-3.5 h-3.5 text-zinc-500" />}
            <div className="flex gap-2 text-xs font-mono">
              <span className="text-emerald-400">{bullishPct}% ↑</span>
              <span className="text-red-400">{bearishPct}% ↓</span>
              <span className="text-zinc-500">{neutralPct}% —</span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-zinc-600 italic">No analyzed items</span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-zinc-700" />

      {/* Item count */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Items in feed</span>
        <span className="text-xs font-mono text-zinc-300">{newsItems.length}</span>
      </div>

      {/* Top sectors */}
      {topSectors.length > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Active sectors</span>
            <div className="flex gap-1.5">
              {topSectors.map(s => (
                <span key={s} className="text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Disclaimer tag */}
      <div className="ml-auto">
        <span className="text-xs text-zinc-600 italic">Analytical signals only — not financial advice</span>
      </div>
    </div>
  );
}