// Portfolio Simulation Engine — paper-trading only.
// Architecturally isolated from analytics layer. Requires explicit user confirmation per regulatory framing.
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, BarChart3, AlertTriangle, Settings, Play, Trash2, ChevronRight } from "lucide-react";
import SimulationConfirmModal from "@/components/simulation/SimulationConfirmModal";
import SimulationResultsView from "@/components/simulation/SimulationResultsView";

// Generate realistic mock simulation data for educational purposes
const generateSimulationData = (capital, days, strategy) => {
  const strategyParams = {
    conservative: { drift: 0.0003, vol: 0.008 },
    moderate: { drift: 0.0005, vol: 0.014 },
    aggressive: { drift: 0.0008, vol: 0.022 },
    custom: { drift: 0.0006, vol: 0.016 },
  };
  const { drift, vol } = strategyParams[strategy] || strategyParams.moderate;

  let value = capital;
  let benchmarkValue = capital;
  const points = [];
  let peak = capital;
  let maxDrawdown = 0;
  const returns = [];

  for (let d = 0; d <= days; d += Math.max(1, Math.floor(days / 60))) {
    const dailyReturn = drift + vol * (Math.random() - 0.5) * 2;
    const benchReturn = 0.0004 + 0.012 * (Math.random() - 0.5) * 2;
    value = value * (1 + dailyReturn);
    benchmarkValue = benchmarkValue * (1 + benchReturn);
    returns.push(dailyReturn);
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    const date = new Date();
    date.setDate(date.getDate() - (days - d));
    points.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(value),
      benchmark: Math.round(benchmarkValue),
    });
  }

  const totalReturn = (value - capital) / capital * 100;
  const annualizedReturn = (Math.pow(value / capital, 365 / days) - 1) * 100;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance) * Math.sqrt(252);
  const sharpeRatio = ((annualizedReturn / 100) - 0.05) / stdDev;
  const benchReturn = (benchmarkValue - capital) / capital * 100;

  return {
    total_return_pct: totalReturn,
    annualized_return_pct: annualizedReturn,
    max_drawdown_pct: maxDrawdown * 100,
    sharpe_ratio: sharpeRatio,
    volatility_pct: stdDev * 100,
    benchmark_return_pct: benchReturn,
    period_days: days,
    data_points: points,
  };
};

const STRATEGIES = ["conservative", "moderate", "aggressive", "custom"];
const PERIODS = [
  { label: "1 Month", days: 30 },
  { label: "3 Months", days: 90 },
  { label: "6 Months", days: 180 },
  { label: "1 Year", days: 365 },
];

export default function PortfolioSimulator() {
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSimulation, setPendingSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formCapital, setFormCapital] = useState("100000");
  const [formStrategy, setFormStrategy] = useState("moderate");
  const [formPeriod, setFormPeriod] = useState(365);
  const [formHoldings, setFormHoldings] = useState([
    { ticker: "AAPL", name: "Apple Inc.", allocation_pct: 20, sector: "Technology" },
    { ticker: "MSFT", name: "Microsoft Corp.", allocation_pct: 20, sector: "Technology" },
    { ticker: "JPM", name: "JPMorgan Chase", allocation_pct: 15, sector: "Financials" },
    { ticker: "JNJ", name: "Johnson & Johnson", allocation_pct: 15, sector: "Healthcare" },
    { ticker: "XOM", name: "ExxonMobil", allocation_pct: 15, sector: "Energy" },
    { ticker: "BONDS", name: "US Treasury Bonds", allocation_pct: 15, sector: "Fixed Income" },
  ]);

  const fetchPortfolios = async () => {
    setLoading(true);
    const data = await base44.entities.Portfolio.list("-created_date", 20);
    setPortfolios(data);
    setLoading(false);
  };

  useEffect(() => { fetchPortfolios(); }, []);

  const handleCreate = async () => {
    if (!formName.trim() || !formCapital) return;
    const portfolio = await base44.entities.Portfolio.create({
      name: formName.trim(),
      initial_capital: parseFloat(formCapital),
      strategy: formStrategy,
      holdings: formHoldings,
      simulation_status: "draft",
      simulation_confirmed: false,
    });
    setPortfolios(prev => [portfolio, ...prev]);
    setSelectedPortfolio(portfolio);
    setShowCreateForm(false);
    setFormName("");
  };

  const handleRunSimulation = (portfolio) => {
    setPendingSimulation({ portfolio, period: formPeriod });
    setShowConfirmModal(true);
  };

  const handleConfirmSimulation = async () => {
    setShowConfirmModal(false);
    setSimulating(true);
    const { portfolio, period } = pendingSimulation;

    // Mark confirmed
    await base44.entities.AuditLog.create({
      event_type: "simulation_confirmed",
      entity_type: "Portfolio",
      entity_id: portfolio.id,
      description: `User confirmed paper simulation for portfolio: "${portfolio.name}"`,
      user_confirmed: true,
      metadata: { period_days: period, strategy: portfolio.strategy, disclaimer_version: "1.0" }
    });

    // Generate simulation data (paper only — no external API calls, educational mock data)
    const results = generateSimulationData(portfolio.initial_capital, period, portfolio.strategy);

    const updated = await base44.entities.Portfolio.update(portfolio.id, {
      simulation_confirmed: true,
      simulation_status: "complete",
      simulation_results: results,
      disclaimer_version: "1.0",
    });

    await base44.entities.AuditLog.create({
      event_type: "simulation_run",
      entity_type: "Portfolio",
      entity_id: portfolio.id,
      description: `Paper simulation completed for "${portfolio.name}"`,
      output_summary: `Return: ${results.total_return_pct.toFixed(2)}%, Sharpe: ${results.sharpe_ratio.toFixed(2)}, Period: ${period}d`,
    });

    setPortfolios(prev => prev.map(p => p.id === portfolio.id ? { ...p, ...updated } : p));
    setSelectedPortfolio({ ...portfolio, ...updated });
    setSimulating(false);
    setPendingSimulation(null);
  };

  const handleDelete = async (id) => {
    await base44.entities.Portfolio.delete(id);
    setPortfolios(prev => prev.filter(p => p.id !== id));
    if (selectedPortfolio?.id === id) setSelectedPortfolio(null);
  };

  const allocationTotal = formHoldings.reduce((sum, h) => sum + (h.allocation_pct || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-zinc-200 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-400" />
            Portfolio Simulator
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">Paper-trading simulation engine — no real capital involved</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Simulation
        </button>
      </div>

      {/* Compliance notice */}
      <div className="flex items-start gap-2 bg-zinc-900 border border-amber-500/20 rounded-md p-3">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="text-amber-400 font-medium">Paper Trading Only.</span> This simulator uses mock historical data for educational strategy exploration. 
          No real brokerage integrations are active. No real capital is at risk. 
          All simulations require explicit user confirmation before running. Results are not financial projections.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Portfolio list */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Your Simulations</h3>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 bg-zinc-900 border border-zinc-700/60 rounded-md animate-pulse" />)}
            </div>
          ) : portfolios.length === 0 ? (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-6 text-center">
              <p className="text-xs text-zinc-600">No simulations yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {portfolios.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPortfolio(p)}
                  className={`group border rounded-md p-3 cursor-pointer transition-all ${
                    selectedPortfolio?.id === p.id
                      ? "border-blue-500/50 bg-blue-500/5"
                      : "border-zinc-700/60 bg-zinc-900 hover:bg-zinc-800/60 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{p.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        ${(p.initial_capital || 0).toLocaleString()} · {p.strategy}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${
                        p.simulation_status === "complete" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : p.simulation_status === "running" ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                        : "text-zinc-500 bg-zinc-800 border-zinc-700"
                      }`}>
                        {p.simulation_status}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {p.simulation_results && (
                    <p className={`text-xs font-mono mt-1.5 ${p.simulation_results.total_return_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.simulation_results.total_return_pct >= 0 ? "+" : ""}{p.simulation_results.total_return_pct?.toFixed(2)}% simulated return
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Create form */}
          {showCreateForm && (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5 space-y-4">
              <h3 className="text-sm font-medium text-zinc-200">New Paper Simulation</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-zinc-500 block mb-1">Portfolio Name</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Diversified Growth Strategy"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Simulated Capital</label>
                  <input
                    type="number"
                    value={formCapital}
                    onChange={e => setFormCapital(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Strategy Profile</label>
                  <select
                    value={formStrategy}
                    onChange={e => setFormStrategy(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                  >
                    {STRATEGIES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Simulation Period</label>
                  <select
                    value={formPeriod}
                    onChange={e => setFormPeriod(parseInt(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                  >
                    {PERIODS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Holdings */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500">Holdings Allocation</label>
                  <span className={`text-xs font-mono ${allocationTotal === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                    {allocationTotal}% allocated
                  </span>
                </div>
                <div className="space-y-1.5">
                  {formHoldings.map((h, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2 items-center">
                      <input
                        value={h.ticker}
                        onChange={e => {
                          const n = [...formHoldings];
                          n[i] = { ...n[i], ticker: e.target.value };
                          setFormHoldings(n);
                        }}
                        className="col-span-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="TICK"
                      />
                      <input
                        value={h.name}
                        onChange={e => {
                          const n = [...formHoldings];
                          n[i] = { ...n[i], name: e.target.value };
                          setFormHoldings(n);
                        }}
                        className="col-span-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                        placeholder="Name"
                      />
                      <input
                        type="number"
                        value={h.allocation_pct}
                        onChange={e => {
                          const n = [...formHoldings];
                          n[i] = { ...n[i], allocation_pct: parseFloat(e.target.value) || 0 };
                          setFormHoldings(n);
                        }}
                        className="col-span-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="%"
                      />
                      <button
                        onClick={() => setFormHoldings(prev => prev.filter((_, j) => j !== i))}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setFormHoldings(prev => [...prev, { ticker: "", name: "", allocation_pct: 0, sector: "" }])}
                  className="mt-2 text-xs text-zinc-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add holding
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowCreateForm(false)} className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formName.trim() || !formCapital || allocationTotal === 0}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-md transition-colors"
                >
                  Create Portfolio
                </button>
              </div>
            </div>
          )}

          {/* Selected portfolio detail */}
          {selectedPortfolio && !showCreateForm && (
            <div className="space-y-4">
              <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">{selectedPortfolio.name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      ${(selectedPortfolio.initial_capital || 0).toLocaleString()} · {selectedPortfolio.strategy} · {selectedPortfolio.holdings?.length || 0} holdings
                    </p>
                  </div>
                  {selectedPortfolio.simulation_status !== "complete" && (
                    <button
                      onClick={() => handleRunSimulation(selectedPortfolio)}
                      disabled={simulating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 text-white rounded-md transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {simulating ? "Running..." : "Run Simulation"}
                    </button>
                  )}
                </div>

                {/* Holdings table */}
                {selectedPortfolio.holdings && selectedPortfolio.holdings.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Holdings</h4>
                    <div className="space-y-1">
                      {selectedPortfolio.holdings.map((h, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-blue-400 w-14">${h.ticker}</span>
                            <span className="text-xs text-zinc-400">{h.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-zinc-500">{h.sector}</span>
                            <span className="text-xs font-mono text-zinc-300 w-10 text-right">{h.allocation_pct}%</span>
                            <div className="w-20 h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${h.allocation_pct}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Simulation results */}
              {selectedPortfolio.simulation_results && (
                <SimulationResultsView
                  results={selectedPortfolio.simulation_results}
                  portfolioName={selectedPortfolio.name}
                />
              )}

              {selectedPortfolio.simulation_status === "draft" && (
                <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-6 text-center">
                  <Play className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">Run a simulation to see educational results</p>
                  <p className="text-xs text-zinc-600 mt-1">You will be asked to confirm before the simulation runs</p>
                </div>
              )}
            </div>
          )}

          {!selectedPortfolio && !showCreateForm && (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-12 text-center">
              <BarChart3 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Select or create a portfolio simulation</p>
              <p className="text-xs text-zinc-600 mt-1">All simulations use paper trading — no real capital is involved</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirmModal && pendingSimulation && (
        <SimulationConfirmModal
          portfolio={pendingSimulation.portfolio}
          onConfirm={handleConfirmSimulation}
          onCancel={() => { setShowConfirmModal(false); setPendingSimulation(null); }}
        />
      )}
    </div>
  );
}