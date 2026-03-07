// Hypothesis Explorer — browse, generate, and inspect research hypotheses.
// All language is framed as analytical research, not financial advice.
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FlaskConical, Plus, Filter, AlertTriangle, Search } from "lucide-react";
import HypothesisCard from "@/components/hypothesis/HypothesisCard";
import HypothesisDetailPanel from "@/components/hypothesis/HypothesisDetailPanel";
import GenerateHypothesisModal from "@/components/hypothesis/GenerateHypothesisModal";
import ConfidenceMeter from "@/components/shared/ConfidenceMeter";

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  { value: "momentum", label: "Momentum" },
  { value: "reversal", label: "Reversal" },
  { value: "macro_impact", label: "Macro" },
  { value: "event_driven", label: "Event" },
  { value: "sector_rotation", label: "Sector" },
  { value: "correlation", label: "Correlation" },
];

const CONFIDENCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default function HypothesisExplorer() {
  const [hypotheses, setHypotheses] = useState([]);
  const [newsItems, setNewsItems] = useState([]);
  const [selectedHypothesis, setSelectedHypothesis] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [hyps, news] = await Promise.all([
      base44.entities.Hypothesis.list("-created_date", 100),
      base44.entities.NewsItem.filter({ analysis_status: "complete" }, "-created_date", 100),
    ]);
    setHypotheses(hyps);
    setNewsItems(news);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerated = (hypothesis) => {
    setHypotheses(prev => [hypothesis, ...prev]);
  };

  const handleUpdated = (updated) => {
    setHypotheses(prev => prev.map(h => h.id === updated.id ? updated : h));
  };

  const filtered = hypotheses.filter(h => {
    const matchSearch = !searchQuery ||
      h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.entities_involved || []).some(e => e.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchType = typeFilter === "all" || h.hypothesis_type === typeFilter;
    const matchConfidence = confidenceFilter === "all" || h.confidence_level === confidenceFilter;
    const matchStatus = h.status === statusFilter;
    return matchSearch && matchType && matchConfidence && matchStatus;
  });

  // Aggregate stats
  const active = hypotheses.filter(h => h.status === "active");
  const highConf = active.filter(h => h.confidence_level === "high");

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-zinc-200 tracking-tight flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-zinc-400" />
            Hypothesis Explorer
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">AI-generated research hypotheses with cited evidence — analytical use only</p>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Generate Hypothesis
        </button>
      </div>

      {/* Compliance banner */}
      <div className="flex items-start gap-2 bg-zinc-900 border border-zinc-700/60 rounded-md p-3">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-500 leading-relaxed">
          All hypotheses are research instruments generated from analytical signals. They represent investigative frameworks, not financial advice, 
          predictions of market outcomes, or investment recommendations. Each hypothesis includes a full reasoning chain and evidence citations for transparency.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Hypotheses", value: active.length },
          { label: "High Confidence", value: highConf.length },
          { label: "Evidence Sources", value: active.reduce((acc, h) => acc + (h.supporting_news_ids?.length || 0), 0) },
          { label: "Archived", value: hypotheses.filter(h => h.status === "archived").length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-700/60 rounded-md p-3">
            <p className="text-xs text-zinc-500 mb-1">{label}</p>
            <p className="text-xl font-semibold font-mono text-zinc-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search hypotheses..."
            className="bg-zinc-900 border border-zinc-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 w-56 transition-colors"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 p-1 bg-zinc-800 rounded-md">
          {["active", "archived", "invalidated"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-400 focus:outline-none"
        >
          {TYPE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {/* Confidence filter */}
        <div className="flex items-center gap-1">
          {CONFIDENCE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setConfidenceFilter(f.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                confidenceFilter === f.value ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-600 ml-1">{filtered.length} results</span>
      </div>

      {/* Hypothesis grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border border-zinc-700/60 bg-zinc-900 rounded-md p-4 animate-pulse">
              <div className="h-3 bg-zinc-800 rounded w-32 mb-2" />
              <div className="h-4 bg-zinc-800 rounded w-full mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-12 text-center">
          <FlaskConical className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No hypotheses found</p>
          <p className="text-xs text-zinc-600 mt-1">
            {newsItems.length === 0
              ? "First add and analyze news items, then generate hypotheses from the evidence."
              : "Generate a hypothesis by selecting analyzed news items as evidence."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(h => (
            <HypothesisCard
              key={h.id}
              hypothesis={h}
              onClick={setSelectedHypothesis}
            />
          ))}
        </div>
      )}

      {/* Panels and modals */}
      {selectedHypothesis && (
        <HypothesisDetailPanel
          hypothesis={selectedHypothesis}
          onClose={() => setSelectedHypothesis(null)}
          onUpdated={handleUpdated}
        />
      )}
      {showGenerateModal && (
        <GenerateHypothesisModal
          newsItems={newsItems}
          onClose={() => setShowGenerateModal(false)}
          onGenerated={handleGenerated}
        />
      )}
    </div>
  );
}