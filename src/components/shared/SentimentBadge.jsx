// Sentiment indicator component — used across news and hypothesis views.
// Labels are analytical signals, never financial recommendations.
export default function SentimentBadge({ sentiment, score }) {
  const config = {
    bullish:  { label: "Bullish Signal",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    bearish:  { label: "Bearish Signal",  cls: "bg-red-500/10 text-red-400 border-red-500/20" },
    neutral:  { label: "Neutral",         cls: "bg-zinc-700/50 text-zinc-400 border-zinc-600" },
    mixed:    { label: "Mixed Signal",    cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  };
  const c = config[sentiment] || config.neutral;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${c.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {c.label}
      {score !== undefined && (
        <span className="opacity-60 ml-0.5">({score > 0 ? "+" : ""}{score.toFixed(2)})</span>
      )}
    </span>
  );
}