// Individual news card for the intelligence feed.
// Each card shows source, entities, sentiment signal, and links to original article.
import { ExternalLink, Clock, Zap, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SentimentBadge from "@/components/shared/SentimentBadge";
import EntityTag from "@/components/shared/EntityTag";
import { formatSignalPercent, getSignalStrength } from "@/lib/newsSignals";

export default function NewsCard({ item, onClick, onAnalyze, isAnalyzing }) {
  const timeAgo = item.published_at
    ? formatDistanceToNow(new Date(item.published_at), { addSuffix: true })
    : formatDistanceToNow(new Date(item.created_date), { addSuffix: true });

  return (
    <div
      onClick={() => onClick(item)}
      className="group border border-zinc-700/60 bg-zinc-900 hover:bg-zinc-800/60 hover:border-zinc-600 rounded-md p-4 cursor-pointer transition-all duration-150"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider shrink-0">
            {item.source}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs text-zinc-600 flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" />
            {timeAgo}
          </span>
        </div>
        {item.analysis_status === "complete" && item.sentiment && (
          <SentimentBadge sentiment={item.sentiment} score={item.sentiment_score} />
        )}
        {item.analysis_status === "analyzing" && (
          <span className="flex items-center gap-1 text-xs text-blue-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
          </span>
        )}
        {item.analysis_status !== "complete" && item.analysis_status !== "analyzing" && onAnalyze && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnalyze(item); }}
            disabled={isAnalyzing}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/10 transition-colors disabled:opacity-40"
          >
            <Zap className="w-3 h-3" /> Analyze
          </button>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-zinc-200 leading-snug mb-2 group-hover:text-white transition-colors line-clamp-2">
        {item.title}
      </h3>

      {/* Summary */}
      {item.summary && (
        <p className="text-xs text-zinc-500 leading-relaxed mb-3 line-clamp-2">{item.summary}</p>
      )}

      {item.analysis_status === "complete" && getSignalStrength(item.sentiment_score) > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Signal strength</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${Number(item.sentiment_score) >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
              style={{ width: formatSignalPercent(item.sentiment_score) }}
            />
          </div>
          <span className="text-xs font-mono text-zinc-400">{formatSignalPercent(item.sentiment_score)}</span>
        </div>
      )}

      {/* Entity tags */}
      {item.entities && item.entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.entities.slice(0, 6).map((e, i) => (
            <EntityTag key={i} entity={e} />
          ))}
          {item.entities.length > 6 && (
            <span className="text-xs text-zinc-600">+{item.entities.length - 6} more</span>
          )}
        </div>
      )}

      {/* Sector tags */}
      {item.sector_tags && item.sector_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.sector_tags.map((tag, i) => (
            <span key={i} className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-blue-400 transition-colors mt-1"
        >
          <ExternalLink className="w-3 h-3" />
          View source
        </a>
      )}
    </div>
  );
}