// Hypothesis card for the explorer view.
// Displays title, confidence, type, and entity involvement.
import { FlaskConical, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ConfidenceMeter from "@/components/shared/ConfidenceMeter";

const typeLabels = {
  momentum: "Momentum",
  reversal: "Reversal",
  macro_impact: "Macro Impact",
  sector_rotation: "Sector Rotation",
  event_driven: "Event-Driven",
  correlation: "Correlation",
};

const horizonLabels = {
  short_term: "Short-Term",
  medium_term: "Medium-Term",
  long_term: "Long-Term",
};

export default function HypothesisCard({ hypothesis, onClick }) {
  return (
    <div
      onClick={() => onClick(hypothesis)}
      className="group border border-zinc-700/60 bg-zinc-900 hover:bg-zinc-800/60 hover:border-zinc-600 rounded-md p-4 cursor-pointer transition-all duration-150"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-500">
            {typeLabels[hypothesis.hypothesis_type] || "Research Hypothesis"}
          </span>
          {hypothesis.time_horizon && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-600">{horizonLabels[hypothesis.time_horizon]}</span>
            </>
          )}
        </div>
        <span className="text-xs text-zinc-600 flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(hypothesis.created_date), { addSuffix: true })}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-zinc-200 leading-snug mb-3 group-hover:text-white transition-colors line-clamp-2">
        {hypothesis.title}
      </h3>

      {/* Confidence */}
      <div className="mb-3">
        <ConfidenceMeter level={hypothesis.confidence_level} score={hypothesis.confidence_score} />
      </div>

      {/* Entities */}
      {hypothesis.entities_involved && hypothesis.entities_involved.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {hypothesis.entities_involved.slice(0, 5).map((e, i) => (
            <span key={i} className="text-xs font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
              {e}
            </span>
          ))}
        </div>
      )}

      {/* Evidence count */}
      {hypothesis.supporting_news_ids && hypothesis.supporting_news_ids.length > 0 && (
        <p className="text-xs text-zinc-600">
          {hypothesis.supporting_news_ids.length} evidence source{hypothesis.supporting_news_ids.length !== 1 ? "s" : ""} cited
        </p>
      )}
    </div>
  );
}