// Audit Log — append-only transparency log for all AI-generated outputs and user confirmations.
// Required for regulatory framing: all AI reasoning sources and actions are logged here.
import { useState, useEffect } from "react";
import { appClient } from "@/api/appClient";
import { Shield, Clock, Filter, Search, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const EVENT_COLORS = {
  news_ingested: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  analysis_run: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  hypothesis_generated: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  simulation_confirmed: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  simulation_run: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  integration_activated: "text-red-400 bg-red-500/10 border-red-500/20",
  disclaimer_acknowledged: "text-zinc-400 bg-zinc-700/50 border-zinc-600",
  user_action: "text-zinc-400 bg-zinc-700/50 border-zinc-600",
};

const EVENT_LABELS = {
  news_ingested: "News Ingested",
  analysis_run: "Analysis Run",
  hypothesis_generated: "Hypothesis Generated",
  simulation_confirmed: "Simulation Confirmed",
  simulation_run: "Simulation Run",
  integration_activated: "Integration Activated",
  disclaimer_acknowledged: "Disclaimer Acknowledged",
  user_action: "User Action",
};

function LogEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const colorCls = EVENT_COLORS[entry.event_type] || EVENT_COLORS.user_action;

  return (
    <div className="border border-zinc-700/60 bg-zinc-900 rounded-md overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Event type badge */}
        <span className={`text-xs px-2 py-0.5 rounded border shrink-0 mt-0.5 ${colorCls}`}>
          {EVENT_LABELS[entry.event_type] || entry.event_type}
        </span>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-300 leading-snug">{entry.description}</p>
          <div className="flex items-center gap-3 mt-1">
            {entry.entity_type && (
              <span className="text-xs text-zinc-600">{entry.entity_type}</span>
            )}
            {entry.ai_model_used && (
              <span className="text-xs text-zinc-600">AI: {entry.ai_model_used}</span>
            )}
            {entry.user_confirmed && (
              <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                <Shield className="w-3 h-3" /> User-confirmed
              </span>
            )}
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-zinc-600">
            {formatDistanceToNow(new Date(entry.created_date), { addSuffix: true })}
          </span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-700/60 p-3 bg-zinc-800/30 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-600 mb-0.5">Timestamp</p>
              <p className="text-zinc-400 font-mono">{format(new Date(entry.created_date), "yyyy-MM-dd HH:mm:ss")}</p>
            </div>
            {entry.entity_id && (
              <div>
                <p className="text-zinc-600 mb-0.5">Entity ID</p>
                <p className="text-zinc-400 font-mono truncate">{entry.entity_id}</p>
              </div>
            )}
            {entry.input_summary && (
              <div className="col-span-2">
                <p className="text-zinc-600 mb-0.5">Input Summary</p>
                <p className="text-zinc-400">{entry.input_summary}</p>
              </div>
            )}
            {entry.output_summary && (
              <div className="col-span-2">
                <p className="text-zinc-600 mb-0.5">Output Summary</p>
                <p className="text-zinc-400">{entry.output_summary}</p>
              </div>
            )}
            {entry.sources_cited && entry.sources_cited.length > 0 && (
              <div className="col-span-2">
                <p className="text-zinc-600 mb-0.5">Sources Cited</p>
                <div className="space-y-0.5">
                  {entry.sources_cited.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                      className="block text-blue-400 hover:text-blue-300 truncate transition-colors">{src}</a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const data = await appClient.entities.AuditLog.list("-created_date", 200);
      setLogs(data);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const filtered = logs.filter(log => {
    const matchType = typeFilter === "all" || log.event_type === typeFilter;
    const matchSearch = !searchQuery || log.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchType && matchSearch;
  });

  const eventTypes = [...new Set(logs.map(l => l.event_type))];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-zinc-200 tracking-tight flex items-center gap-2">
            <Shield className="w-4 h-4 text-zinc-400" />
            Audit & Transparency Log
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">Append-only record of all AI outputs, analyses, and user confirmations</p>
        </div>
        <span className="text-xs text-zinc-600 font-mono">{logs.length} entries</span>
      </div>

      {/* Explainer */}
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-md p-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          This log records every analytical operation performed on this platform in chronological order. 
          All AI-generated outputs include the model used, input context, and output summary. 
          All user confirmations (simulations, disclaimer acknowledgments) are permanently recorded. 
          This log cannot be modified or deleted — it serves as the platform's transparency and accountability record.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search log entries..."
            className="bg-zinc-900 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 w-56 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-zinc-600" />
          <button
            onClick={() => setTypeFilter("all")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${typeFilter === "all" ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}
          >
            All
          </button>
          {eventTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${typeFilter === type ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}
            >
              {EVENT_LABELS[type] || type}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600 ml-1">{filtered.length} entries</span>
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 bg-zinc-900 border border-zinc-700/60 rounded-md animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-10 text-center">
          <Shield className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No log entries yet</p>
          <p className="text-xs text-zinc-600 mt-1">Activity will be recorded here as you use the platform</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(entry => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}