// Displays paper simulation results with charts and key metrics.
// All results labeled as educational simulation — not financial projections.
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend
} from "recharts";

const MetricCard = ({ label, value, sub, positive }) => (
  <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-md p-3">
    <p className="text-xs text-zinc-500 mb-1">{label}</p>
    <p className={`text-lg font-semibold font-mono ${
      positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-zinc-200"
    }`}>
      {value}
    </p>
    {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
  </div>
);

export default function SimulationResultsView({ results, portfolioName }) {
  if (!results) return null;

  const {
    total_return_pct, annualized_return_pct, max_drawdown_pct,
    sharpe_ratio, volatility_pct, benchmark_return_pct,
    period_days, data_points = []
  } = results;

  const isPositive = total_return_pct >= 0;

  return (
    <div className="space-y-5">
      {/* Simulation disclaimer */}
      <div className="flex items-start gap-2 bg-zinc-800/50 border border-zinc-700/50 rounded-md p-3">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="text-amber-400">Paper simulation results.</span> The following data represents a historical simulation using mock/educational data only. 
          Past simulation performance does not indicate future results. These figures are not financial projections.
        </p>
      </div>

      {/* Summary metrics */}
      <div>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Simulation Metrics — {portfolioName}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <MetricCard
            label="Total Return (Simulated)"
            value={`${isPositive ? "+" : ""}${total_return_pct?.toFixed(2)}%`}
            sub={`Over ${period_days} days`}
            positive={isPositive}
          />
          <MetricCard
            label="Annualized Return"
            value={`${annualized_return_pct >= 0 ? "+" : ""}${annualized_return_pct?.toFixed(2)}%`}
            positive={annualized_return_pct >= 0}
          />
          <MetricCard
            label="Max Drawdown"
            value={`${max_drawdown_pct?.toFixed(2)}%`}
            sub="Peak-to-trough"
            positive={false}
          />
          <MetricCard
            label="Sharpe Ratio"
            value={sharpe_ratio?.toFixed(2)}
            sub="Risk-adjusted return"
            positive={sharpe_ratio >= 1}
          />
          <MetricCard
            label="Volatility (Ann.)"
            value={`${volatility_pct?.toFixed(2)}%`}
          />
          <MetricCard
            label="vs. Benchmark"
            value={`${total_return_pct - benchmark_return_pct >= 0 ? "+" : ""}${(total_return_pct - benchmark_return_pct)?.toFixed(2)}%`}
            sub={`Benchmark: ${benchmark_return_pct?.toFixed(2)}%`}
            positive={(total_return_pct - benchmark_return_pct) >= 0}
          />
        </div>
      </div>

      {/* Performance chart */}
      {data_points.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Portfolio Value Over Time (Simulated)</h3>
          <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-md p-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data_points} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "6px" }}
                  labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                  itemStyle={{ color: "#e4e4e7", fontSize: 11 }}
                  formatter={(val) => [`$${val.toLocaleString()}`, "Portfolio Value"]}
                />
                <ReferenceLine y={data_points[0]?.value} stroke="#3f3f46" strokeDasharray="4 4" />
                <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Portfolio (Simulated)"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: "#3b82f6" }}
                />
                {data_points[0]?.benchmark && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name="Benchmark (Simulated)"
                    stroke="#71717a"
                    strokeWidth={1}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-zinc-600 text-center mt-2">
              Data source: Simulated historical data for educational purposes only — not real market data
            </p>
          </div>
        </div>
      )}
    </div>
  );
}