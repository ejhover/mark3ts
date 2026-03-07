// Individual news card for the intelligence feed.
// Each card shows source, entities, sentiment signal, and links to original article.
import { ExternalLink, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SentimentBadge from "@/components/shared/SentimentBadge";
import EntityTag from "@/components/shared/EntityTag";

export default function NewsCard({ item, onClick }) {
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
        {item.analysis_status === "pending" && (
          <span className="text-xs text-zinc-600 italic">Analyzing...</span>
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