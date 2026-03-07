// Confidence display for hypotheses — visual signal strength indicator.
// Framed as analytical signal confidence, not probability of financial outcome.
export default function ConfidenceMeter({ level, score }) {
  const config = {
    high:   { label: "High Confidence",   color: "bg-blue-500",    bars: 3 },
    medium: { label: "Medium Confidence", color: "bg-amber-500",   bars: 2 },
    low:    { label: "Low Confidence",    color: "bg-zinc-600",    bars: 1 },
  };
  const c = config[level] || config.low;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all ${i <= c.bars ? c.color : "bg-zinc-700"}`}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-500">
        {c.label}
        {score !== undefined && <span className="ml-1 text-zinc-600">({Math.round(score * 100)}%)</span>}
      </span>
    </div>
  );
}