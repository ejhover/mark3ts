// Platform layout — terminal-style analytics UI.
// Wraps all pages with nav, compliance disclaimer, and onboarding modal.
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Activity, Newspaper, FlaskConical, BarChart3, Shield, Settings2, ChevronRight } from "lucide-react";
import OnboardingDisclaimerModal from "@/components/shared/OnboardingDisclaimerModal";

const NAV_ITEMS = [
  { label: "Overview",    page: "Dashboard",           icon: Activity },
  { label: "News Feed",   page: "NewsFeed",            icon: Newspaper },
  { label: "Hypotheses",  page: "HypothesisExplorer",  icon: FlaskConical },
  { label: "Simulator",   page: "PortfolioSimulator",  icon: BarChart3 },
  { label: "Audit Log",   page: "AuditLog",            icon: Shield },
  { label: "Settings",    page: "Settings",            icon: Settings2 },
];

export default function Layout({ children, currentPageName }) {
  const [disclaimerAcknowledged, setDisclaimerAcknowledged] = useState(false);
  const [checkingDisclaimer, setCheckingDisclaimer] = useState(true);

  useEffect(() => {
    // Check if disclaimer was already acknowledged in this session
    const acknowledged = sessionStorage.getItem("finsignal_disclaimer_v1");
    if (acknowledged === "true") {
      setDisclaimerAcknowledged(true);
    }
    setCheckingDisclaimer(false);
  }, []);

  const handleAcknowledge = () => {
    sessionStorage.setItem("finsignal_disclaimer_v1", "true");
    setDisclaimerAcknowledged(true);
  };

  if (checkingDisclaimer) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <style>{`
        * { box-sizing: border-box; }
        body { background: #09090b; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #18181b; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>

      {/* Onboarding disclaimer modal — shown once per session */}
      {!disclaimerAcknowledged && (
        <OnboardingDisclaimerModal onAcknowledge={handleAcknowledge} />
      )}

      {/* Top nav */}
      <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-2.5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
                <Activity className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold text-zinc-200 tracking-tight">mark3ts</span>
            </div>
            <span className="text-xs text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded">Intelligence Platform</span>
          </div>

          {/* Nav items */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ label, page, icon: Icon }) => {
              const isActive = currentPageName === page;
              return (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden border-b border-zinc-800 bg-zinc-950 overflow-x-auto">
        <div className="flex items-center gap-1 px-3 py-2 min-w-max">
          {NAV_ITEMS.map(({ label, page, icon: Icon }) => {
            const isActive = currentPageName === page;
            return (
              <Link
                key={page}
                to={createPageUrl(page)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive ? "bg-zinc-800 text-zinc-200" : "text-zinc-500"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-5">
          {children}
        </div>
      </main>
    </div>
  );
}