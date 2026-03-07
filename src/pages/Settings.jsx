// Settings — optional integrations panel. All advanced integrations disabled by default.
// Activation requires explicit acknowledgment per compliance requirements.
import { useState } from "react";
import { Settings2, AlertTriangle, Shield, Lock, ExternalLink, CheckCircle, XCircle } from "lucide-react";

// Integration definitions — all disabled by default, require acknowledgment to activate
const INTEGRATIONS = [
  {
    id: "live_market_data",
    name: "Live Market Data Feed",
    description: "Connect a real-time market data provider (e.g. Alpaca, Polygon.io, Yahoo Finance API) for live price feeds.",
    status: "disabled",
    warning: "Enabling live data does not activate any trading functionality. Price data is used for display and simulation calibration only. Requires your own API key from a third-party provider.",
    category: "Data",
    complexity: "Low",
  },
  {
    id: "brokerage_readonly",
    name: "Brokerage Read-Only (Portfolio Sync)",
    description: "Sync your actual portfolio positions in read-only mode for benchmarking against simulations.",
    status: "disabled",
    warning: "Read-only access only. This platform will never initiate trades or send orders to any brokerage. Requires review of your broker's API terms before enabling.",
    category: "Brokerage",
    complexity: "Medium",
  },
  {
    id: "news_rss",
    name: "Automated RSS Feed Ingestion",
    description: "Automatically ingest articles from configured RSS feeds on a scheduled basis.",
    status: "planned",
    warning: "This feature is planned for a future backend service extension. Current news ingestion is manual.",
    category: "Data",
    complexity: "Low",
  },
  {
    id: "alert_email",
    name: "Hypothesis Alert Notifications",
    description: "Receive email alerts when new high-confidence hypotheses are generated matching your watchlist.",
    status: "disabled",
    warning: "Alert notifications are informational only. They do not constitute financial advice or action triggers.",
    category: "Notifications",
    complexity: "Low",
  },
];

function IntegrationCard({ integration }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const statusConfig = {
    disabled: { label: "Disabled", cls: "text-zinc-500 bg-zinc-800 border-zinc-700" },
    planned: { label: "Planned", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    active: { label: "Active", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  };
  const sc = statusConfig[integration.status];

  return (
    <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-zinc-200">{integration.name}</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${sc.cls}`}>{sc.label}</span>
            <span className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{integration.category}</span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">{integration.description}</p>
        </div>
        <Lock className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
      </div>

      {/* Warning block */}
      {showWarning ? (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3 mb-3">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/80 leading-relaxed">{integration.warning}</p>
          </div>
          {integration.status === "disabled" && (
            <label className="flex items-start gap-2 cursor-pointer">
              <div
                onClick={() => setAcknowledged(!acknowledged)}
                className={`w-3.5 h-3.5 mt-0.5 rounded border shrink-0 flex items-center justify-center ${
                  acknowledged ? "bg-blue-600 border-blue-600" : "border-zinc-600 bg-zinc-800"
                }`}
              >
                {acknowledged && (
                  <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-zinc-500">I understand the limitations and compliance requirements</p>
            </label>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-2 mt-3">
        {integration.status === "disabled" && !showWarning && (
          <button
            onClick={() => setShowWarning(true)}
            className="text-xs text-zinc-500 hover:text-zinc-400 border border-zinc-700 rounded px-2.5 py-1.5 transition-colors"
          >
            View activation requirements
          </button>
        )}
        {integration.status === "disabled" && showWarning && (
          <>
            <button
              onClick={() => { setShowWarning(false); setAcknowledged(false); }}
              className="text-xs text-zinc-500 hover:text-zinc-400 border border-zinc-700 rounded px-2.5 py-1.5 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!acknowledged}
              className="text-xs border rounded px-2.5 py-1.5 transition-colors disabled:text-zinc-600 disabled:border-zinc-700 text-zinc-400 border-zinc-600 hover:text-zinc-300 disabled:cursor-not-allowed"
            >
              Activate (requires backend service)
            </button>
          </>
        )}
        {integration.status === "planned" && (
          <p className="text-xs text-zinc-600 italic">Available in a future backend service release</p>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const categories = [...new Set(INTEGRATIONS.map(i => i.category))];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-zinc-200 tracking-tight flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-zinc-400" />
          Platform Settings
        </h1>
        <p className="text-xs text-zinc-600 mt-0.5">Optional integrations and configuration — all advanced features disabled by default</p>
      </div>

      {/* System status */}
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Platform Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "News Intelligence", status: "active" },
            { label: "Hypothesis Engine", status: "active" },
            { label: "Portfolio Simulator", status: "active" },
            { label: "Audit Logging", status: "active" },
            { label: "Live Market Data", status: "disabled" },
            { label: "Brokerage Integration", status: "disabled" },
            { label: "Automated Ingestion", status: "disabled" },
            { label: "Order Execution", status: "never" },
          ].map(({ label, status }) => (
            <div key={label} className="flex items-center gap-2">
              {status === "active" ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : status === "never" ? (
                <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-zinc-600 shrink-0" />
              )}
              <span className={`text-xs ${status === "active" ? "text-zinc-300" : status === "never" ? "text-zinc-600 line-through" : "text-zinc-500"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-3 italic">
          Order execution is architecturally excluded from this platform — it is not planned and cannot be activated.
        </p>
      </div>

      {/* Compliance frame */}
      <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Regulatory Framework</h2>
        <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
          <p>This platform is designed as an <strong className="text-zinc-400">educational analytics and decision-support tool</strong>. It is not registered as an investment advisor, broker-dealer, or financial institution.</p>
          <p>All AI-generated outputs are framed as analytical signals, research hypotheses, and simulation results — never as advice, recommendations, or predictions.</p>
          <p>All optional integration modules that involve external financial data are disabled by default and require explicit user acknowledgment before activation.</p>
          <p>Order execution capabilities are architecturally excluded from the platform design and are not available through any configuration path.</p>
          <p className="text-zinc-600">System boundary: Analytics service ↔ Simulation engine are architecturally separated. Future execution capabilities, if ever introduced, must be deployed as a fully independent service with separate compliance review.</p>
        </div>
      </div>

      {/* Optional integrations */}
      <div>
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Optional Integrations</h2>
        <p className="text-xs text-zinc-600 mb-4">All integrations are disabled by default. Each requires explicit acknowledgment before activation. Most require backend service extensions.</p>
        <div className="space-y-3">
          {INTEGRATIONS.map(integration => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      </div>
    </div>
  );
}