// Slide-in detail panel for a selected news item.
// Shows full analysis, extracted entities, sentiment, macro signals, and source link.
import { X, ExternalLink, Zap, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SentimentBadge from "@/components/shared/SentimentBadge";
import EntityTag from "@/components/shared/EntityTag";

export default function NewsDetailPanel({ item, onClose, onAnalyze, analyzing }) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-700 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{item.source}</span>
            {item.published_at && (
              <span className="text-xs text-zinc-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <h2 className="text-base font-semibold text-zinc-100 leading-snug">{item.title}</h2>

          {/* Sentiment */}
          {item.sentiment && (
            <div className="flex items-center gap-2">
              <SentimentBadge sentiment={item.sentiment} score={item.sentiment_score} />
            </div>
          )}

          {/* Analysis disclaimer */}
          <div className="flex items-start gap-2 bg-zinc-800/50 border border-zinc-700/50 rounded-md p-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-500 leading-relaxed">
              Sentiment signals are analytical indicators derived from text analysis. They are not financial recommendations or predictions.
            </p>
          </div>

          {/* Summary */}
          {item.summary && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Summary</h4>
              <p className="text-sm text-zinc-300 leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* Full content */}
          {item.full_content && item.full_content !== item.summary && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Full Content</h4>
              <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{item.full_content}</p>
            </div>
          )}

          {/* Extracted entities */}
          {item.entities && item.entities.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Extracted Entities</h4>
              <div className="flex flex-wrap gap-1.5">
                {item.entities.map((e, i) => <EntityTag key={i} entity={e} />)}
              </div>
            </div>
          )}

          {/* Sectors */}
          {item.sector_tags && item.sector_tags.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Sectors</h4>
              <div className="flex flex-wrap gap-1.5">
                {item.sector_tags.map((tag, i) => (
                  <span key={i} className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Macro signals */}
          {item.macro_signals && item.macro_signals.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Macro Signals</h4>
              <div className="flex flex-wrap gap-1.5">
                {item.macro_signals.map((sig, i) => (
                  <span key={i} className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Analyze button */}
          {item.analysis_status !== "complete" && (
            <button
              onClick={() => onAnalyze(item)}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-md transition-colors"
            >
              <Zap className="w-4 h-4" />
              {analyzing ? "Running Analysis..." : "Run AI Analysis"}
            </button>
          )}
        </div>

        {/* Source link footer */}
        {item.source_url && (
          <div className="px-5 py-3 border-t border-zinc-700/60 shrink-0">
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View original source — {item.source}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}