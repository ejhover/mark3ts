// Modal for submitting a news article for ingestion and AI analysis.
// Accepts a URL or manual text input. Triggers analysis pipeline on submit.
import { useState } from "react";
import { X, Link, FileText, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function IngestNewsModal({ onClose, onIngested }) {
  const [mode, setMode] = useState("url"); // "url" or "manual"
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getApiBaseUrl = () => {
    const fromEnv = import.meta.env.VITE_API_URL;
    if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
      return fromEnv.replace(/\/$/, "");
    }
    return "";
  };

  const createNews = async (newsData) => {
    const baseUrl = getApiBaseUrl();
    const endpoint = baseUrl ? `${baseUrl}/api/news` : "/api/news";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newsData),
      });
      if (!res.ok) {
        throw new Error(`News API error: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error("News API create failed, falling back to local storage", err);
      return base44.entities.NewsItem.create(newsData);
    }
  };

  const handleSubmit = async () => {
    if (mode === "url" && !url.trim()) { setError("Please enter a URL."); return; }
    if (mode === "manual" && (!title.trim() || !content.trim())) { setError("Title and content are required."); return; }
    setError("");
    setLoading(true);

    let newsData = { analysis_status: "pending", ingestion_source: "user_submitted" };

    if (mode === "url") {
      // Extract source domain for attribution
      const domain = new URL(url).hostname.replace("www.", "");
      newsData = { ...newsData, source_url: url, source: source || domain, title: title || "Article from " + domain };
    } else {
      newsData = { ...newsData, title, source: source || "Manual Entry", full_content: content };
    }

    const created = await createNews(newsData);

    // Log ingestion to audit trail
    await base44.entities.AuditLog.create({
      event_type: "news_ingested",
      entity_type: "NewsItem",
      entity_id: created.id,
      description: `News item ingested: "${newsData.title}"`,
      sources_cited: url ? [url] : [],
    });

    onIngested(created);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-zinc-200">Add News Item</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-zinc-800 rounded-md mb-5">
          {[{ id: "url", icon: Link, label: "By URL" }, { id: "manual", icon: FileText, label: "Manual Entry" }].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === id ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "url" && (
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Article URL</label>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Title {mode === "url" && <span className="text-zinc-600">(optional)</span>}</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Article headline"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Source Name <span className="text-zinc-600">(optional)</span></label>
            <input
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="e.g. Reuters, Bloomberg"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {mode === "manual" && (
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Content</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
                placeholder="Paste article text..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
          >
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...</> : "Add & Queue Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}