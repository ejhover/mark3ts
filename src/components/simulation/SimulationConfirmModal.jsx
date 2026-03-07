// Mandatory confirmation gate before any simulation runs.
// Per regulatory framing: user must explicitly confirm paper-trading nature before proceeding.
import { useState } from "react";
import { AlertTriangle, Shield, X } from "lucide-react";

export default function SimulationConfirmModal({ portfolio, onConfirm, onCancel }) {
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(false);
  const [checked3, setChecked3] = useState(false);

  const allChecked = checked1 && checked2 && checked3;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-200">Simulation Confirmation Required</h2>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>

        {/* Portfolio info */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-md p-3 mb-5">
          <p className="text-xs text-zinc-500 mb-1">Portfolio to simulate</p>
          <p className="text-sm font-medium text-zinc-200">{portfolio?.name}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Initial capital: <span className="text-zinc-300">${(portfolio?.initial_capital || 0).toLocaleString()}</span>
            {" · "}Strategy: <span className="text-zinc-300">{portfolio?.strategy}</span>
          </p>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-md p-3 mb-5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200/80 leading-relaxed">
            You are about to run a <strong>paper trading simulation only</strong>. 
            No real capital is involved. Results are for educational and research purposes only.
          </p>
        </div>

        {/* Checkboxes */}
        <div className="space-y-3 mb-5">
          {[
            { state: checked1, set: setChecked1, text: "I understand this is a paper-trading simulation. No real money or assets are involved." },
            { state: checked2, set: setChecked2, text: "Simulation results are educational tools only and do not predict future market performance." },
            { state: checked3, set: setChecked3, text: "I will not make investment decisions based solely on these simulation results." },
          ].map(({ state, set, text }, i) => (
            <label key={i} className="flex items-start gap-2.5 cursor-pointer">
              <div
                onClick={() => set(!state)}
                className={`w-4 h-4 mt-0.5 rounded border shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                  state ? "bg-blue-600 border-blue-600" : "border-zinc-600 bg-zinc-800"
                }`}
              >
                {state && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{text}</p>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-md transition-colors"
          >
            Confirm — Run Simulation
          </button>
        </div>
      </div>
    </div>
  );
}