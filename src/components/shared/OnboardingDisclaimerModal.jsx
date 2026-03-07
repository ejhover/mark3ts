// First-run compliance modal. Must be acknowledged before any platform features are accessible.
import { useState } from "react";
import { Shield, AlertTriangle, BookOpen, BarChart3, FlaskConical } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function OnboardingDisclaimerModal({ onAcknowledge }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;
    setLoading(true);
    // Log acknowledgment to audit trail
    await base44.entities.AuditLog.create({
      event_type: "disclaimer_acknowledged",
      description: "User acknowledged platform disclaimer and compliance terms",
      user_confirmed: true,
      metadata: { disclaimer_version: "1.0", timestamp: new Date().toISOString() }
    });
    onAcknowledge();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-2xl w-full p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">FinSignal Intelligence Platform</h1>
            <p className="text-xs text-zinc-500">Compliance & Terms of Use — Version 1.0</p>
          </div>
        </div>

        {/* Warning block */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-4 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-200 leading-relaxed">
              This platform provides <strong>analytical research tools only</strong>. It does not provide financial advice, 
              investment recommendations, or predictions of future market performance.
            </p>
          </div>
        </div>

        {/* Feature explanations */}
        <div className="space-y-3 mb-6">
          {[
            {
              icon: BookOpen,
              label: "News Intelligence",
              desc: "Automated extraction of entities and analytical sentiment signals from public news sources. For research use only."
            },
            {
              icon: FlaskConical,
              label: "Hypothesis Engine",
              desc: "AI-generated research hypotheses with cited evidence and reasoning chains. Not predictions or recommendations."
            },
            {
              icon: BarChart3,
              label: "Portfolio Simulation",
              desc: "Paper-trading simulation engine for educational strategy exploration. No real capital is involved. Requires explicit confirmation before each run."
            }
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-md border border-zinc-700/50">
              <Icon className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-zinc-300">{label}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Acknowledgment checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-6 group">
          <div
            onClick={() => setChecked(!checked)}
            className={`w-4 h-4 mt-0.5 rounded border shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
              checked ? "bg-blue-600 border-blue-600" : "border-zinc-600 bg-zinc-800"
            }`}
          >
            {checked && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            I understand this platform is an educational analytics tool only. I will not rely on any output as financial advice. 
            I confirm I have read and accept the compliance terms and will consult a qualified financial advisor before making investment decisions.
          </p>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-md transition-colors"
        >
          {loading ? "Recording acknowledgment..." : "I Understand — Enter Platform"}
        </button>
      </div>
    </div>
  );
}