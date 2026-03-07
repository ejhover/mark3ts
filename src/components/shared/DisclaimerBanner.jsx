// Persistent compliance disclaimer — embedded in layout per regulatory framing requirements.
// This component must never be removed or hidden behind user toggles.
import { AlertTriangle } from "lucide-react";

export default function DisclaimerBanner() {
  return (
    <div className="w-full bg-zinc-900 border-t border-zinc-700 px-4 py-2 flex items-center gap-2">
      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
      <p className="text-xs text-zinc-500 leading-relaxed">
        <span className="text-amber-500 font-medium">Educational Use Only.</span>{" "}
        All insights, signals, and simulation results are analytical tools for research purposes only. 
        Nothing on this platform constitutes financial advice, investment recommendations, or predictions of future performance. 
        Past simulation results do not guarantee future outcomes. Consult a qualified financial advisor before making any investment decisions.
      </p>
    </div>
  );
}