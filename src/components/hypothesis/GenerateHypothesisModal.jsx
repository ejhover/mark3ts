// Modal for generating a new research hypothesis from selected news items.
// Uses AI to produce a reasoned hypothesis with citations. Logs to audit trail.
import { useState } from "react";
import { X, FlaskConical, Loader2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const HYPOTHESIS_TYPES = [
  { value: "momentum", label: "Momentum" },
  { value: "reversal", label: "Reversal" },
  { value: "macro_impact", label: "Macro Impact" },
  { value: "sector_rotation", label: "Sector Rotation" },
  { value: "event_driven", label: "Event-Driven" },
  { value: "correlation", label: "Correlation" },
];

const TIME_HORIZONS = [
  { value: "short_term", label: "Short-Term (days–weeks)" },
  { value: "medium_term", label: "Medium-Term (weeks–months)" },
  { value: "long_term", label: "Long-Term (months–years)" },
];

export default function GenerateHypothesisModal({ newsItems, onClose, onGenerated }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [hypothesisType, setHypothesisType] = useState("event_driven");
  const [timeHorizon, setTimeHorizon] = useState("medium_term");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleNews = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const selectedItems = newsItems.filter(n => selectedIds.includes(n.id));

  const handleGenerate = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);

    const newsContext = selectedItems.map((n, i) =>
      `[${i + 1}] "${n.title}" (Source: ${n.source})\nSummary: ${n.summary || n.title}\nSentiment: ${n.sentiment || "not analyzed"}`
    ).join("\n\n");

    const prompt = `You are a financial research analyst generating educational research hypotheses for analytical purposes only. 
This is NOT financial advice. Generate a structured research hypothesis based on these news items.

News Items:
${newsContext}

Hypothesis Type: ${hypothesisType}
Time Horizon: ${timeHorizon}
${focus ? `Focus Area: ${focus}` : ""}

Generate a JSON response with:
- title: A clear research hypothesis statement (framed as "may", "could suggest", "analytical signal indicates" — never as a prediction or recommendation)
- reasoning: A detailed reasoning chain explaining the analytical basis, citing each news item by number [1], [2], etc. (3-5 paragraphs)
- entities_involved: Array of company names or tickers mentioned
- confidence_level: "low", "medium", or "high" based on signal strength and evidence quality
- confidence_score: Number 0.0-1.0
- audit_log: Array of 3-5 strings documenting the analytical steps taken

Important: Frame all language as educational research. Never claim certainty about future market movements.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          reasoning: { type: "string" },
          entities_involved: { type: "array", items: { type: "string" } },
          confidence_level: { type: "string", enum: ["low", "medium", "high"] },
          confidence_score: { type: "number" },
          audit_log: { type: "array", items: { type: "string" } },
        }
      }
    });

    const hypothesis = await base44.entities.Hypothesis.create({
      title: result.title,
      reasoning: result.reasoning,
      entities_involved: result.entities_involved || [],
      confidence_level: result.confidence_level || "medium",
      confidence_score: result.confidence_score || 0.5,
      hypothesis_type: hypothesisType,
      time_horizon: timeHorizon,
      supporting_news_ids: selectedIds,
      supporting_news_titles: selectedItems.map(n => n.title),
      audit_log: result.audit_log || [],
      status: "active",
      disclaimer_acknowledged: true,
    });

    // Log to audit trail
    await base44.entities.AuditLog.create({
      event_type: "hypothesis_generated",
      entity_type: "Hypothesis",
      entity_id: hypothesis.id,
      description: `Research hypothesis generated: "${result.title}"`,
      ai_model_used: "InvokeLLM",
      input_summary: `${selectedIds.length} news items analyzed, type: ${hypothesisType}`,
      output_summary: `Confidence: ${result.confidence_level}, Entities: ${(result.entities_involved || []).join(", ")}`,
      sources_cited: selectedItems.map(n => n.source_url).filter(Boolean),
    });

    onGenerated(hypothesis);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Generate Research Hypothesis</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>

        {/* Compliance notice */}
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-md p-3 mb-5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-500 leading-relaxed">
            Generated hypotheses are analytical research tools only. They do not constitute financial advice or investment recommendations.
          </p>
        </div>

        {/* Config */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Hypothesis Type</label>
            <select
              value={hypothesisType}
              onChange={e => setHypothesisType(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              {HYPOTHESIS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Time Horizon</label>
            <select
              value={timeHorizon}
              onChange={e => setTimeHorizon(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              {TIME_HORIZONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-xs text-zinc-500 block mb-1">Focus Area <span className="text-zinc-600">(optional)</span></label>
          <input
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder="e.g. semiconductor sector, interest rate sensitivity"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* News selection */}
        <div className="mb-5">
          <label className="text-xs text-zinc-500 block mb-2">
            Select Evidence Sources ({selectedIds.length} selected)
          </label>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {newsItems.length === 0 && (
              <p className="text-xs text-zinc-600 italic">No news items available. Add some from the News Feed.</p>
            )}
            {newsItems.map(item => (
              <label key={item.id} className="flex items-start gap-2.5 p-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded cursor-pointer hover:bg-zinc-800 transition-colors">
                <div
                  onClick={() => toggleNews(item.id)}
                  className={`w-3.5 h-3.5 mt-0.5 rounded border shrink-0 flex items-center justify-center ${
                    selectedIds.includes(item.id) ? "bg-blue-600 border-blue-600" : "border-zinc-600"
                  }`}
                >
                  {selectedIds.includes(item.id) && (
                    <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0" onClick={() => toggleNews(item.id)}>
                  <p className="text-xs text-zinc-300 leading-snug line-clamp-1">{item.title}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{item.source}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || selectedIds.length === 0}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
          >
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><FlaskConical className="w-3.5 h-3.5" /> Generate Hypothesis</>}
          </button>
        </div>
      </div>
    </div>
  );
}