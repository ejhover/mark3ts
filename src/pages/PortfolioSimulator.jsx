// Portfolio Simulation Engine — paper-trading only.
// Creates a simulation at portfolio creation time, then updates value on demand from live Finnhub quotes.
import { useEffect, useMemo, useState } from "react";
import { appClient } from "@/api/appClient";
import {
  Plus,
  BarChart3,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import SimulationResultsView from "@/components/simulation/SimulationResultsView";
import {
  buildSignalDrivenHoldings,
  describeSignalDirection,
  formatSignalPercent,
  normalizeTicker,
} from "@/lib/newsSignals";

const STRATEGIES = ["conservative", "moderate", "aggressive", "custom"];
const TOPIC_TICKER_FALLBACKS = {
  OIL: ["XOM", "CVX", "COP", "SLB"],
  CHINA: ["BABA", "JD", "PDD", "BIDU"],
  GOLD: ["NEM", "AEM", "GOLD", "FNV"],
  AI: ["NVDA", "MSFT", "AVGO", "AMD"],
  SEMICONDUCTORS: ["NVDA", "AMD", "AVGO", "QCOM"],
  BANKS: ["JPM", "BAC", "WFC", "C"],
  ENERGY: ["XOM", "CVX", "COP", "EOG"],
};

function formatChartDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function calculatePositionValue(holding, price) {
  const entryPrice = Number(holding.avg_cost) || 0;
  const allocationAmount = Number(holding.allocation_amount) || 0;
  const marketPrice = Number(price) || entryPrice;
  if (!entryPrice || !allocationAmount) return allocationAmount;

  const priceRatio = marketPrice / entryPrice;
  if (holding.position_type === "short") {
    return Math.max(0, allocationAmount * (2 - priceRatio));
  }

  return allocationAmount * priceRatio;
}

function calculateHoldingReturnPct(holding) {
  const baseline = Number(holding?.allocation_amount) || 0;
  if (baseline <= 0) return 0;
  const currentValue = Number(holding?.current_value) || baseline;
  return ((currentValue - baseline) / baseline) * 100;
}

function getPortfolioLiveValue(portfolio) {
  const explicitLive = Number(
    portfolio?.simulation_results?.live_value ??
      portfolio?.simulation_results?.current_value,
  );
  if (Number.isFinite(explicitLive) && explicitLive > 0) return explicitLive;

  const holdings = Array.isArray(portfolio?.holdings) ? portfolio.holdings : [];
  if (holdings.length > 0) {
    const sum = holdings.reduce(
      (total, holding) =>
        total +
        (Number(holding?.current_value) ||
          Number(holding?.allocation_amount) ||
          0),
      0,
    );
    if (sum > 0) return sum;
  }

  return Number(portfolio?.initial_capital) || 0;
}

function buildInitialResults(capital, holdings) {
  const now = new Date().toISOString();
  const liveValue = holdings.reduce(
    (sum, holding) => sum + (holding.current_value || 0),
    0,
  );
  return {
    invested_at: now,
    period_days: 0,
    total_return_pct: 0,
    annualized_return_pct: 0,
    max_drawdown_pct: 0,
    sharpe_ratio: 0,
    volatility_pct: 0,
    benchmark_return_pct: 0,
    current_value: liveValue,
    live_value: liveValue,
    live_value_as_of: now,
    benchmark_symbol: "SPY",
    data_source: "finnhub",
    data_points: [
      {
        timestamp: now,
        date: formatChartDate(now),
        value: Math.round(liveValue),
        benchmark: Math.round(capital),
      },
    ],
  };
}

function rebalanceHoldings(holdings, capital) {
  const totalPct = holdings.reduce(
    (sum, holding) => sum + (Number(holding.allocation_pct) || 0),
    0,
  );
  const denominator = totalPct > 0 ? totalPct : holdings.length;
  return holdings.map((holding) => {
    const basePct =
      totalPct > 0
        ? Number(holding.allocation_pct || 0)
        : 100 / Math.max(1, holdings.length);
    const normalizedPct = (basePct / denominator) * 100;
    return {
      ...holding,
      allocation_pct: Number(normalizedPct.toFixed(2)),
      allocation_amount: Number(
        (((Number(capital) || 0) * normalizedPct) / 100).toFixed(2),
      ),
    };
  });
}

function uniqueTickers(list) {
  return [
    ...new Set(
      (list || []).map((ticker) => normalizeTicker(ticker)).filter(Boolean),
    ),
  ];
}

function parseTickerCandidates(payload) {
  const direct = [];
  if (typeof payload?.primary_ticker === "string")
    direct.push(payload.primary_ticker);
  if (Array.isArray(payload?.alternative_tickers))
    direct.push(...payload.alternative_tickers);
  if (Array.isArray(payload?.tickers)) direct.push(...payload.tickers);
  return uniqueTickers(direct);
}

function applyLiveQuotesToPortfolio(portfolio, quotesMap) {
  if (!portfolio?.simulation_results || !portfolio?.holdings?.length)
    return portfolio;

  const nextHoldings = portfolio.holdings.map((holding) => {
    const liveQuote = quotesMap?.[holding.ticker];
    const currentPrice =
      Number(liveQuote?.current) ||
      Number(holding.current_price) ||
      Number(holding.avg_cost) ||
      0;
    return {
      ...holding,
      current_price: currentPrice,
      current_value: Number(
        calculatePositionValue(holding, currentPrice).toFixed(2),
      ),
    };
  });

  const liveValue = nextHoldings.reduce(
    (sum, holding) => sum + (holding.current_value || 0),
    0,
  );
  const baseResults = portfolio.simulation_results;
  const initialCapital = Number(portfolio.initial_capital) || 0;
  const totalReturn =
    initialCapital > 0
      ? ((liveValue - initialCapital) / initialCapital) * 100
      : 0;
  const investedAt = baseResults?.invested_at
    ? new Date(baseResults.invested_at)
    : new Date();
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - investedAt.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const updatedPoint = {
    timestamp: new Date().toISOString(),
    date: formatChartDate(new Date().toISOString()),
    value: Math.round(liveValue),
    benchmark:
      baseResults.data_points?.[baseResults.data_points.length - 1]
        ?.benchmark || Math.round(initialCapital),
  };

  const historicalPoints = baseResults.data_points || [];
  const lastPoint = historicalPoints[historicalPoints.length - 1];
  const nextPoints =
    lastPoint && lastPoint.date === updatedPoint.date
      ? [
          ...historicalPoints.slice(0, -1),
          { ...lastPoint, value: updatedPoint.value },
        ]
      : [...historicalPoints, updatedPoint];

  return {
    ...portfolio,
    holdings: nextHoldings,
    simulation_results: {
      ...baseResults,
      period_days: elapsedDays,
      current_value: liveValue,
      live_value: liveValue,
      live_value_as_of: new Date().toISOString(),
      total_return_pct: totalReturn,
      data_points: nextPoints,
    },
  };
}

export default function PortfolioSimulator() {
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [analyzedNews, setAnalyzedNews] = useState([]);
  const [priceStatus, setPriceStatus] = useState({
    configured: false,
    provider: "finnhub",
    webhook_configured: false,
  });
  const [priceError, setPriceError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [updatingPortfolioId, setUpdatingPortfolioId] = useState("");
  const [resolvedSignalHoldings, setResolvedSignalHoldings] = useState([]);
  const [resolvingSignalHoldings, setResolvingSignalHoldings] = useState(false);
  const [signalResolutionError, setSignalResolutionError] = useState("");

  const [formName, setFormName] = useState("");
  const [formCapital, setFormCapital] = useState("10000");
  const [formStrategy, setFormStrategy] = useState("moderate");
  const [formMode, setFormMode] = useState("signal_driven");
  const [formMinSignal, setFormMinSignal] = useState("0.20");
  const [formHoldings, setFormHoldings] = useState([
    {
      ticker: "AAPL",
      name: "Apple Inc.",
      allocation_pct: 50,
      allocation_amount: 5000,
      sector: "Technology",
      position_type: "long",
    },
    {
      ticker: "MSFT",
      name: "Microsoft Corp.",
      allocation_pct: 50,
      allocation_amount: 5000,
      sector: "Technology",
      position_type: "long",
    },
  ]);

  const recommendedHoldings = useMemo(() => {
    return buildSignalDrivenHoldings(
      analyzedNews,
      parseFloat(formCapital) || 0,
      {
        minSignalStrength: Number(formMinSignal) || 0.2,
        maxPositions: 8,
      },
    );
  }, [analyzedNews, formCapital, formMinSignal]);

  const allocationTotal = (
    formMode === "signal_driven" ? resolvedSignalHoldings : formHoldings
  ).reduce((sum, holding) => sum + (holding.allocation_pct || 0), 0);

  const findReplacementTickerForHolding = async (holding, usedTickers) => {
    const baseKey = String(holding.ticker || holding.name || "")
      .trim()
      .toUpperCase();
    const fallbackCandidates = [
      ...(TOPIC_TICKER_FALLBACKS[baseKey] || []),
      ...(TOPIC_TICKER_FALLBACKS[
        String(holding.sector || "")
          .trim()
          .toUpperCase()
      ] || []),
    ];

    let llmCandidates = [];
    try {
      const prompt = `Find real, liquid, US-traded stock tickers related to this market topic.
Topic: ${holding.name || holding.ticker}
Sector hint: ${holding.sector || "unknown"}
Signal direction: ${holding.position_type || "long"}

Return JSON only:
- primary_ticker: string
- alternative_tickers: string[] (up to 5)
Use only actual company tickers, no countries, no commodities, no ETFs unless absolutely necessary.`;

      const llm = await fetchJson("/api/llm/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              primary_ticker: { type: "string" },
              alternative_tickers: { type: "array", items: { type: "string" } },
            },
          },
        }),
      });
      llmCandidates = parseTickerCandidates(llm);
    } catch {
      llmCandidates = [];
    }

    const candidates = uniqueTickers([
      ...fallbackCandidates,
      ...llmCandidates,
    ]).filter((ticker) => !usedTickers.has(ticker));
    if (!candidates.length) return null;

    const validation = await fetchJson(
      `/api/prices/validate?symbols=${encodeURIComponent(candidates.join(","))}`,
    );
    const valid = (validation.valid_symbols || []).find(
      (ticker) => !usedTickers.has(ticker),
    );
    if (!valid) return null;

    return {
      ticker: valid,
      name: valid,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const resolveSignalHoldings = async () => {
      if (formMode !== "signal_driven") {
        setResolvedSignalHoldings([]);
        setSignalResolutionError("");
        return;
      }

      if (!recommendedHoldings.length) {
        setResolvedSignalHoldings([]);
        setSignalResolutionError("");
        return;
      }

      setResolvingSignalHoldings(true);
      setSignalResolutionError("");

      try {
        const normalized = recommendedHoldings
          .map((holding) => ({
            ...holding,
            ticker: normalizeTicker(holding.ticker),
          }))
          .filter((holding) => holding.ticker);

        const initialSymbols = uniqueTickers(
          normalized.map((holding) => holding.ticker),
        );
        const validation = await fetchJson(
          `/api/prices/validate?symbols=${encodeURIComponent(initialSymbols.join(","))}`,
        );
        const validSet = new Set(validation.valid_symbols || []);
        const invalidSet = new Set(validation.invalid_symbols || []);

        const used = new Set();
        const output = [];
        for (const holding of normalized) {
          if (validSet.has(holding.ticker) && !used.has(holding.ticker)) {
            used.add(holding.ticker);
            output.push(holding);
            continue;
          }

          if (invalidSet.has(holding.ticker)) {
            const replacement = await findReplacementTickerForHolding(
              holding,
              used,
            );
            if (replacement) {
              used.add(replacement.ticker);
              output.push({
                ...holding,
                ticker: replacement.ticker,
                name: replacement.name,
              });
            }
          }
        }

        const rebalanced = rebalanceHoldings(output, Number(formCapital) || 0);
        if (!cancelled) {
          setResolvedSignalHoldings(rebalanced);
          if (!rebalanced.length) {
            setSignalResolutionError(
              "No valid tradable stocks could be resolved from the current analyzed signals.",
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          setResolvedSignalHoldings([]);
          setSignalResolutionError(
            error.message ||
              "Failed to resolve valid stock tickers for signal allocations.",
          );
        }
      } finally {
        if (!cancelled) {
          setResolvingSignalHoldings(false);
        }
      }
    };

    resolveSignalHoldings();
    return () => {
      cancelled = true;
    };
  }, [formMode, recommendedHoldings, formCapital]);

  const fetchPageData = async () => {
    setLoading(true);
    const portfolioRows = appClient.entities.Portfolio.list(
      "-created_date",
      20,
    );
    let newsRows = [];

    try {
      const backendNews = await fetchJson("/api/news");
      newsRows = (backendNews || []).filter(
        (item) => item.analysis_status === "complete",
      );
    } catch {
      newsRows = appClient.entities.NewsItem.filter(
        { analysis_status: "complete" },
        "-created_date",
        3000,
      );
    }

    setPortfolios(portfolioRows);
    setAnalyzedNews(newsRows);

    try {
      const status = await fetchJson("/api/prices/status");
      setPriceStatus(status);
      setPriceError("");
    } catch (error) {
      setPriceStatus({
        configured: false,
        provider: "finnhub",
        webhook_configured: false,
      });
      setPriceError(error.message);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPageData();
  }, []);

  const initializePortfolioFromQuotes = async (draftPortfolio) => {
    const baseHoldings = rebalanceHoldings(
      draftPortfolio.holdings || [],
      draftPortfolio.initial_capital || 0,
    )
      .map((holding) => ({
        ...holding,
        ticker: normalizeTicker(holding.ticker),
      }))
      .filter((holding) => holding.ticker);

    const symbols = [...new Set(baseHoldings.map((holding) => holding.ticker))];
    if (symbols.length === 0) {
      throw new Error("No valid ticker symbols found in the portfolio.");
    }

    const validation = await fetchJson(
      `/api/prices/validate?symbols=${encodeURIComponent(symbols.join(","))}`,
    );
    const validSet = new Set(validation.valid_symbols || []);
    const validHoldings = baseHoldings.filter((holding) =>
      validSet.has(holding.ticker),
    );

    if (validHoldings.length === 0) {
      throw new Error(
        "None of the detected symbols were tradable in Finnhub. Try lowering threshold or analyze more news.",
      );
    }

    const normalizedHoldings = rebalanceHoldings(
      validHoldings,
      draftPortfolio.initial_capital || 0,
    );
    const quotePayload = await fetchJson(
      `/api/prices/quotes?symbols=${encodeURIComponent([...new Set(normalizedHoldings.map((holding) => holding.ticker))].join(","))}`,
    );

    const pricedHoldings = normalizedHoldings.map((holding) => {
      const quote = quotePayload?.quotes?.[holding.ticker] || {};
      const currentPrice = Number(quote.current);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error(`No valid current quote for ${holding.ticker}`);
      }

      const shares = Number(holding.allocation_amount || 0) / currentPrice;
      return {
        ...holding,
        shares: Number(shares.toFixed(6)),
        avg_cost: Number(currentPrice.toFixed(4)),
        current_price: Number(currentPrice.toFixed(4)),
        current_value: Number(
          calculatePositionValue(
            { ...holding, avg_cost: currentPrice },
            currentPrice,
          ).toFixed(2),
        ),
      };
    });

    const simulation_results = buildInitialResults(
      draftPortfolio.initial_capital || 0,
      pricedHoldings,
    );

    return {
      ...draftPortfolio,
      holdings: pricedHoldings,
      simulation_status: "complete",
      simulation_confirmed: true,
      simulation_results,
      invalid_symbols: validation.invalid_symbols || [],
    };
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formCapital) return;

    const rawHoldings =
      formMode === "signal_driven" ? resolvedSignalHoldings : formHoldings;
    if (!rawHoldings.length) return;

    setCreatingPortfolio(true);
    setPriceError("");

    try {
      const draft = {
        id: crypto.randomUUID(),
        name: formName.trim(),
        initial_capital: parseFloat(formCapital),
        strategy: formStrategy,
        holdings: rawHoldings,
        source_mode: formMode,
        signal_threshold:
          formMode === "signal_driven" ? Number(formMinSignal) || 0.2 : null,
        source_news_ids:
          formMode === "signal_driven"
            ? [
                ...new Set(
                  rawHoldings.flatMap(
                    (holding) => holding.supporting_news_ids || [],
                  ),
                ),
              ]
            : [],
        created_date: new Date().toISOString(),
      };

      const initialized = await initializePortfolioFromQuotes(draft);
      const created = await appClient.entities.Portfolio.create(initialized);

      await appClient.entities.AuditLog.create({
        event_type: "simulation_created",
        entity_type: "Portfolio",
        entity_id: created.id,
        description: `Created live-tracked paper portfolio \"${created.name}\" with ${created.holdings.length} validated symbols.`,
        output_summary: `Initial value: $${Math.round(created.simulation_results.live_value).toLocaleString()}`,
      });

      setPortfolios((current) => [created, ...current]);
      setSelectedPortfolio(created);
      setShowCreateForm(false);
      setFormName("");
    } catch (error) {
      setPriceError(error.message || "Failed to create simulation portfolio");
    } finally {
      setCreatingPortfolio(false);
    }
  };

  const updatePortfolioAmount = async (portfolio) => {
    const symbols = [
      ...new Set(
        (portfolio.holdings || [])
          .map((holding) => holding.ticker)
          .filter(Boolean),
      ),
    ];
    if (!symbols.length) return;

    setUpdatingPortfolioId(portfolio.id);
    setPriceError("");
    try {
      const payload = await fetchJson(
        `/api/prices/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
      );
      const updated = applyLiveQuotesToPortfolio(
        portfolio,
        payload.quotes || {},
      );
      await appClient.entities.Portfolio.update(updated.id, updated);
      setPortfolios((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setSelectedPortfolio(updated);
    } catch (error) {
      setPriceError(error.message || "Failed to update portfolio amount");
    } finally {
      setUpdatingPortfolioId("");
    }
  };

  const handleDelete = async (id) => {
    await appClient.entities.Portfolio.delete(id);
    setPortfolios((current) =>
      current.filter((portfolio) => portfolio.id !== id),
    );
    if (selectedPortfolio?.id === id) setSelectedPortfolio(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-zinc-200 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-400" />
            Portfolio Simulator
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">
            Create a paper portfolio from analyzed news signals and update
            current value from Finnhub quotes.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Simulation
        </button>
      </div>

      {!priceStatus.configured && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-zinc-400">
          Live market pricing is not configured yet. Add{" "}
          <span className="font-mono text-zinc-200">FINNHUB_API_KEY</span> in
          backend env.
        </div>
      )}

      {priceError && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          {priceError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Your Simulations
          </h3>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((index) => (
                <div
                  key={index}
                  className="h-16 bg-zinc-900 border border-zinc-700/60 rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : portfolios.length === 0 ? (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-6 text-center">
              <p className="text-xs text-zinc-600">
                No simulations yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {portfolios.map((portfolio) => (
                <div
                  key={portfolio.id}
                  onClick={() => setSelectedPortfolio(portfolio)}
                  className={`group border rounded-md p-3 cursor-pointer transition-all ${
                    selectedPortfolio?.id === portfolio.id
                      ? "border-blue-500/50 bg-blue-500/5"
                      : "border-zinc-700/60 bg-zinc-900 hover:bg-zinc-800/60 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {portfolio.name}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        ${Math.round(getPortfolioLiveValue(portfolio)).toLocaleString()} ·{" "}
                        {portfolio.strategy}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                        active
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(portfolio.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {portfolio.simulation_results && (
                    <p
                      className={`text-xs font-mono mt-1.5 ${portfolio.simulation_results.total_return_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {portfolio.simulation_results.total_return_pct >= 0
                        ? "+"
                        : ""}
                      {portfolio.simulation_results.total_return_pct?.toFixed(
                        2,
                      )}
                      % since creation
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {showCreateForm && (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5 space-y-4">
              <h3 className="text-sm font-medium text-zinc-200">
                New Paper Simulation
              </h3>

              <div className="inline-flex rounded-md bg-zinc-800 p-1">
                {[
                  { value: "signal_driven", label: "News Signal Basket" },
                  { value: "manual", label: "Manual Portfolio" },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setFormMode(mode.value)}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      formMode === mode.value
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-zinc-500 block mb-1">
                    Portfolio Name
                  </label>
                  <input
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    placeholder={
                      formMode === "signal_driven"
                        ? "e.g. AI Signal Basket"
                        : "e.g. Manual Basket"
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    Investment Amount (Fake Money)
                  </label>
                  <input
                    type="number"
                    value={formCapital}
                    onChange={(event) => setFormCapital(event.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    Strategy Profile
                  </label>
                  <select
                    value={formStrategy}
                    onChange={(event) => setFormStrategy(event.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                  >
                    {STRATEGIES.map((strategy) => (
                      <option
                        key={strategy}
                        value={strategy}
                        className="capitalize"
                      >
                        {strategy.charAt(0).toUpperCase() + strategy.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formMode === "signal_driven" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">
                        Minimum Signal Strength
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={formMinSignal}
                        onChange={(event) =>
                          setFormMinSignal(event.target.value)
                        }
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-md p-3">
                      <p className="text-xs text-zinc-500">
                        Qualified positions / analyzed items
                      </p>
                      <p className="text-lg font-mono text-zinc-200 mt-1">
                        {resolvedSignalHoldings.length} / {analyzedNews.length}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border border-zinc-700/60 bg-zinc-800/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Signal Allocations
                      </p>
                      <span
                        className={`text-xs font-mono ${Math.abs(allocationTotal - 100) < 0.5 ? "text-emerald-400" : "text-amber-400"}`}
                      >
                        {allocationTotal.toFixed(2)}% allocated
                      </span>
                    </div>

                    {resolvingSignalHoldings ? (
                      <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                        Resolving valid tradable stocks...
                      </p>
                    ) : resolvedSignalHoldings.length === 0 ? (
                      <p className="text-xs text-zinc-600">
                        {signalResolutionError ||
                          "No valid tradable stocks found for current signals."}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {resolvedSignalHoldings.map((holding) => (
                          <div
                            key={holding.ticker}
                            className="rounded-md border border-zinc-700/40 bg-zinc-900/70 px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-200 truncate">
                                  {holding.ticker}{" "}
                                  <span className="text-zinc-500">
                                    · {holding.name}
                                  </span>
                                </p>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {describeSignalDirection(
                                    holding.signal_score,
                                  )}{" "}
                                  · strength{" "}
                                  {formatSignalPercent(holding.signal_score)} ·{" "}
                                  {holding.article_count} supporting articles
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-mono text-zinc-200">
                                  ${holding.allocation_amount.toLocaleString()}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {holding.allocation_pct}% ·{" "}
                                  {holding.position_type}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-zinc-500">
                      Holdings Allocation
                    </label>
                    <span
                      className={`text-xs font-mono ${Math.abs(allocationTotal - 100) < 0.5 ? "text-emerald-400" : "text-amber-400"}`}
                    >
                      {allocationTotal}% allocated
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {formHoldings.map((holding, index) => (
                      <div
                        key={`${holding.ticker}-${index}`}
                        className="grid grid-cols-6 gap-2 items-center"
                      >
                        <input
                          value={holding.ticker}
                          onChange={(event) => {
                            const next = [...formHoldings];
                            next[index] = {
                              ...next[index],
                              ticker: normalizeTicker(event.target.value),
                            };
                            setFormHoldings(next);
                          }}
                          className="col-span-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                          placeholder="TICK"
                        />
                        <input
                          value={holding.name}
                          onChange={(event) => {
                            const next = [...formHoldings];
                            next[index] = {
                              ...next[index],
                              name: event.target.value,
                            };
                            setFormHoldings(next);
                          }}
                          className="col-span-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                          placeholder="Name"
                        />
                        <input
                          type="number"
                          value={holding.allocation_pct}
                          onChange={(event) => {
                            const allocationPct =
                              parseFloat(event.target.value) || 0;
                            const next = [...formHoldings];
                            next[index] = {
                              ...next[index],
                              allocation_pct: allocationPct,
                              allocation_amount:
                                ((parseFloat(formCapital) || 0) *
                                  allocationPct) /
                                100,
                            };
                            setFormHoldings(next);
                          }}
                          className="col-span-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                          placeholder="%"
                        />
                        <select
                          value={holding.position_type || "long"}
                          onChange={(event) => {
                            const next = [...formHoldings];
                            next[index] = {
                              ...next[index],
                              position_type: event.target.value,
                            };
                            setFormHoldings(next);
                          }}
                          className="col-span-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                        >
                          <option value="long">long</option>
                          <option value="short">short</option>
                        </select>
                        <button
                          onClick={() =>
                            setFormHoldings((current) =>
                              current.filter(
                                (_, candidateIndex) => candidateIndex !== index,
                              ),
                            )
                          }
                          className="text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setFormHoldings((current) => [
                        ...current,
                        {
                          ticker: "",
                          name: "",
                          allocation_pct: 0,
                          allocation_amount: 0,
                          sector: "",
                          position_type: "long",
                        },
                      ])
                    }
                    className="mt-2 text-xs text-zinc-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add holding
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={
                    creatingPortfolio ||
                    resolvingSignalHoldings ||
                    !formName.trim() ||
                    !formCapital ||
                    (formMode === "signal_driven"
                      ? resolvedSignalHoldings.length === 0
                      : allocationTotal === 0)
                  }
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-md transition-colors"
                >
                  {creatingPortfolio ? "Creating..." : "Create & Invest"}
                </button>
              </div>
            </div>
          )}

          {selectedPortfolio && !showCreateForm && (
            <div className="space-y-4">
              <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-5">
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">
                      {selectedPortfolio.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      $
                      {(
                        selectedPortfolio.initial_capital || 0
                      ).toLocaleString()}{" "}
                      · {selectedPortfolio.strategy} ·{" "}
                      {selectedPortfolio.holdings?.length || 0} holdings
                    </p>
                  </div>
                  <button
                    onClick={() => updatePortfolioAmount(selectedPortfolio)}
                    disabled={
                      !priceStatus.configured ||
                      updatingPortfolioId === selectedPortfolio.id
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
                  >
                    {updatingPortfolioId === selectedPortfolio.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Update Portfolio Amount
                  </button>
                </div>

                {selectedPortfolio.signal_threshold != null && (
                  <div className="mb-4 rounded-md border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-400">
                    Built from analyzed article signals with threshold{" "}
                    {Number(selectedPortfolio.signal_threshold).toFixed(2)}.
                    {selectedPortfolio.simulation_results?.invested_at ? (
                      <span>
                        {" "}
                        Invested at{" "}
                        {new Date(
                          selectedPortfolio.simulation_results.invested_at,
                        ).toLocaleString()}
                        .
                      </span>
                    ) : null}
                  </div>
                )}

                {selectedPortfolio.holdings &&
                  selectedPortfolio.holdings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                        Holdings
                      </h4>
                      <div className="space-y-1">
                        {selectedPortfolio.holdings.map((holding, index) => (
                          <div
                            key={`${holding.ticker}-${index}`}
                            className="grid grid-cols-[70px_minmax(0,1fr)_80px_85px_105px_90px] items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0"
                          >
                            <span className="text-xs font-mono text-blue-400 truncate">
                              {holding.ticker}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs text-zinc-300 truncate">
                                {holding.name}
                              </p>
                              <p className="text-[10px] text-zinc-600 truncate">
                                {holding.sector || "News-derived"}
                              </p>
                            </div>
                            <span
                              className={`text-[10px] uppercase tracking-[0.14em] text-right ${holding.position_type === "short" ? "text-red-400" : "text-emerald-400"}`}
                            >
                              {holding.position_type}
                            </span>
                            <span className="text-xs font-mono text-zinc-300 text-right">
                              $
                              {Number(
                                holding.current_price || holding.avg_cost || 0,
                              ).toFixed(2)}
                            </span>
                            <span className="text-xs font-mono text-zinc-400 text-right">
                              $
                              {Math.round(
                                holding.current_value ||
                                  holding.allocation_amount ||
                                  0,
                              ).toLocaleString()}
                            </span>
                            <span
                              className={`text-xs font-mono text-right ${calculateHoldingReturnPct(holding) >= 0 ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {calculateHoldingReturnPct(holding) >= 0 ? "+" : ""}
                              {calculateHoldingReturnPct(holding).toFixed(2)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {selectedPortfolio.simulation_results && (
                <SimulationResultsView
                  results={selectedPortfolio.simulation_results}
                  portfolioName={selectedPortfolio.name}
                />
              )}
            </div>
          )}

          {!selectedPortfolio && !showCreateForm && (
            <div className="border border-zinc-700/60 bg-zinc-900 rounded-md p-12 text-center">
              <BarChart3 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
                Select or create a portfolio simulation
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                Money is allocated at creation, then updated from live Finnhub
                prices when you click Update Portfolio Amount.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
