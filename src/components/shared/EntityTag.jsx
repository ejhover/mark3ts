// Entity tag for companies, tickers, and sectors extracted from news.
export default function EntityTag({ entity }) {
  const typeStyles = {
    ticker:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
    company: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    sector:  "bg-teal-500/10 text-teal-400 border-teal-500/20",
    macro:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const cls = typeStyles[entity.type] || typeStyles.company;
  const label = entity.ticker ? `$${entity.ticker}` : entity.name;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono border ${cls}`}>
      {label}
    </span>
  );
}