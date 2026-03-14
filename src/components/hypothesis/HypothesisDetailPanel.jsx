// Full hypothesis detail panel — reasoning chain, evidence citations, explainability.
// All language is framed as research/analytical, never as financial advice.
import { X, AlertTriangle, BookOpen, Archive } from "lucide-react";
import ConfidenceMeter from "@/components/shared/ConfidenceMeter";
import { appClient } from "@/api/appClient";
import { useState } from "react";

const typeLabels = {
  momentum: "Momentum", reversal: "Reversal", macro_impact: "Macro Impact",
  sector_rotation: "Sector Rotation", event_driven: "Event-Driven", correlation: "Correlation",
};
const horizonLabels = { short_term: "Short-Term", medium_term: "Medium-Term", long_term: "Long-Term" };

export default function HypothesisDetailPanel({ hypothesis, onClose, onUpdated }) {
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    setArchiving(true);
    const updated = await appClient.entities.Hypothesis.update(hypothesis.id, { status: "archived" });
    await appClient.entities.AuditLog.create({
      event_type: "user_action",
      entity_type: "Hypothesis",
      entity_id: hypothesis.id,
      description: `Hypothesis archived: "${hypothesis.title}"`,
    });
    onUpdated(updated);
    setArchiving(false);
    onClose();
  };

  if (!hypothesis) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-700 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Research Hypothesis
            </span>
            {hypothesis.hypothesis_type && (
              <span className="text-xs text-zinc-600">— {typeLabels[hypothesis.hypothesis_type]}</span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <h2 className="text-base font-semibold text-zinc-100 leading-snug">{hypothesis.title}</h2>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-4">
            <ConfidenceMeter level={hypothesis.confidence_level} score={hypothesis.confidence_score} />
            {hypothesis.time_horizon && (
              <span className="text-xs text-zinc-500">
                Horizon: <span className="text-zinc-400">{horizonLabels[hypothesis.time_horizon]}</span>
              </span>
            )}
            {hypothesis.source_group_label && (
              <span className="text-xs text-zinc-500">
                Focus: <span className="text-zinc-300">{hypothesis.source_group_label}</span>
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded border ${
              hypothesis.status === "active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : hypothesis.status === "archived" ? "text-zinc-500 bg-zinc-800 border-zinc-700"
              : "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              {hypothesis.status}
            </span>
          </div>

          {/* Compliance disclaimer */}
          <div className="flex items-start gap-2 bg-zinc-800/50 border border-zinc-700/50 rounded-md p-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-500 leading-relaxed">
              This is a research hypothesis generated from analytical signals. It does not constitute financial advice, 
              an investment recommendation, or a prediction of future market performance.
            </p>
          </div>

          {/* Reasoning chain */}
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Reasoning Chain
            </h4>
            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-md p-4">
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{hypothesis.reasoning}</p>
            </div>
          </div>

          {/* Entities involved */}
          {hypothesis.entities_involved && hypothesis.entities_involved.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Entities Involved</h4>
              <div className="flex flex-wrap gap-1.5">
                {hypothesis.entities_involved.map((e, i) => (
                  <span key={i} className="text-xs font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Evidence sources */}
          {hypothesis.source_group_article_count && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Grouped Evidence</h4>
              <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-md px-3 py-2 text-xs text-zinc-400">
                {hypothesis.source_group_label || "Manual selection"} · {hypothesis.source_group_article_count} related article{hypothesis.source_group_article_count !== 1 ? "s" : ""}
              </div>
            </div>
          )}

          {hypothesis.supporting_news_titles && hypothesis.supporting_news_titles.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Evidence Sources Cited</h4>
              <div className="space-y-1.5">
                {hypothesis.supporting_news_titles.map((title, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-700/40 rounded px-3 py-2">
                    <span className="text-zinc-600 shrink-0 font-mono">[{i + 1}]</span>
                    {title}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit log */}
          {hypothesis.audit_log && hypothesis.audit_log.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Generation Audit Log</h4>
              <div className="space-y-1">
                {hypothesis.audit_log.map((entry, i) => (
                  <p key={i} className="text-xs text-zinc-600 font-mono">→ {entry}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        {hypothesis.status === "active" && (
          <div className="px-5 py-3 border-t border-zinc-700/60 shrink-0">
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-400 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              {archiving ? "Archiving..." : "Archive hypothesis"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}