// Main dashboard — high-level overview of platform activity across all modules.
// Entry point after disclaimer acknowledgment.
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, FlaskConical, BarChart3, Newspaper, ArrowRight, TrendingUp, TrendingDown, Shield } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import MarketOverviewBar from "@/components/dashboard/MarketOverviewBar";
import SentimentBadge from "@/components/shared/SentimentBadge";
import ConfidenceMeter from "@/components/shared/ConfidenceMeter";

function StatCard({ label, value, sub, icon: Icon, to, accentColor = "text-zinc-400" }) {
  return (
    <Link to={to} className="group border border-zinc-700/60 bg-zinc-900 hover:bg-zinc-800/60 hover:border-zinc-600 rounded-md p-4 transition-all block">
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-4 h-4 ${accentColor}`} />
        <ArrowRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-500 transition-colors" />
      </div>
      <p className="text-2xl font-semibold font-mono text-zinc-200 mb-1">{value}</p>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
    </Link>
  );
}

export default function Dashboard() {
  const [newsItems, setNewsItems] = useState([]);
  const [hypotheses, setHypotheses] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [news, hyps, ports, logs] = await Promise.all([
        base44.entities.NewsItem.list("-created_date", 20),
        base44.entities.Hypothesis.list("-created_date", 10),
        base44.entities.Portfolio.list("-created_date", 10),
        base44.entities.AuditLog.list("-created_date", 8),
      ]);
      setNewsItems(news);
      setHypotheses(hyps);
      setPortfolios(ports);
      setAuditLogs(logs);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const analyzed = newsItems.filter(n => n.analysis_status === "complete");
  const activeHyps = hypotheses.filter(h => h.status === "active");
  const highConfHyps = activeHyps.filter(h => h.confidence_level === "high");
  const completedSims = portfolios.filter(p => p.simulation_status === "complete");
  const recentNews = newsItems.slice(0, 5);
  const recentHyps = hypotheses.slice(0, 4);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-zinc-200 tracking-tight">Intelligence Overview</h1>
          <p className="text-xs text-zinc-600 mt-0.5">Platform summary — analytical research tools, not financial advice</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          Compliance mode active
        </div>
      </div>

      {/* Market context */}
      <MarketOverviewBar newsItems={newsItems} />

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-zinc-900 border border-zinc-700/60 rounded-md animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="News Items"
            value={newsItems.length}
            sub={`${analyzed.length} analyzed`}
            icon={Newspaper}
            to={createPageUrl("NewsFeed")}
            accentColor="text-blue-400"
          />
          <StatCard
            label="Active Hypotheses"
            value={activeHyps.length}
            sub={`${highConfHyps.length} high confidence`}
            icon={FlaskConical}
            to={createPageUrl("HypothesisExplorer")}
            accentColor="text-purple-400"
          />
          <StatCard
            label="Simulations"
            value={portfolios.length}
            sub={`${completedSims.length} completed`}
            icon={BarChart3}
            to={createPageUrl("PortfolioSimulator")}
            accentColor="text-teal-400"
          />
          <StatCard
            label="Audit Entries"
            value={auditLogs.length}
            sub="Transparency log"
            icon={Shield}
            to={createPageUrl("AuditLog")}
            accentColor="text-amber-400"
          />
        </div>
      )}

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent news */}
        <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5" /> Recent News
            </h2>
            <Link to={createPageUrl("NewsFeed")} className="text-xs text-zinc-600 hover:text-blue-400 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-zinc-800 rounded animate-pulse" />)}
            </div>
          ) : recentNews.length === 0 ? (
            <p className="text-xs text-zinc-600 italic py-4 text-center">No news items yet. Add some from the News Feed.</p>
          ) : (
            <div className="space-y-2">
              {recentNews.map(item => (
                <Link key={item.id} to={createPageUrl("NewsFeed")} className="block">
                  <div className="flex items-start justify-between gap-2 p-2 rounded hover:bg-zinc-800/60 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-300 leading-snug line-clamp-1">{item.title}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{item.source} · {formatDistanceToNow(new Date(item.created_date), { addSuffix: true })}</p>
                    </div>
                    {item.sentiment && <SentimentBadge sentiment={item.sentiment} />}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent hypotheses */}
        <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Recent Hypotheses
            </h2>
            <Link to={createPageUrl("HypothesisExplorer")} className="text-xs text-zinc-600 hover:text-blue-400 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-zinc-800 rounded animate-pulse" />)}
            </div>
          ) : recentHyps.length === 0 ? (
            <p className="text-xs text-zinc-600 italic py-4 text-center">No hypotheses yet. Generate one from the Hypothesis Explorer.</p>
          ) : (
            <div className="space-y-2">
              {recentHyps.map(h => (
                <Link key={h.id} to={createPageUrl("HypothesisExplorer")} className="block">
                  <div className="p-2 rounded hover:bg-zinc-800/60 transition-colors">
                    <p className="text-xs text-zinc-300 leading-snug line-clamp-1 mb-1">{h.title}</p>
                    <ConfidenceMeter level={h.confidence_level} score={h.confidence_score} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Recent Activity
          </h2>
          <Link to={createPageUrl("AuditLog")} className="text-xs text-zinc-600 hover:text-blue-400 flex items-center gap-1 transition-colors">
            Full log <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />)}
          </div>
        ) : auditLogs.length === 0 ? (
          <p className="text-xs text-zinc-600 italic py-2 text-center">No activity recorded yet</p>
        ) : (
          <div className="space-y-1">
            {auditLogs.map(log => (
              <div key={log.id} className="flex items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                <p className="text-xs text-zinc-400 flex-1 line-clamp-1">{log.description}</p>
                <span className="text-xs text-zinc-600 shrink-0">
                  {formatDistanceToNow(new Date(log.created_date), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}