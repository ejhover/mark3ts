import NewsFeed from './pages/NewsFeed';
import HypothesisExplorer from './pages/HypothesisExplorer';
import PortfolioSimulator from './pages/PortfolioSimulator';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import __Layout from './Layout.jsx';


export const PAGES = {
    "NewsFeed": NewsFeed,
    "HypothesisExplorer": HypothesisExplorer,
    "PortfolioSimulator": PortfolioSimulator,
    "AuditLog": AuditLog,
    "Settings": Settings,
    "Dashboard": Dashboard,
}

export const pagesConfig = {
    mainPage: "NewsFeed",
    Pages: PAGES,
    Layout: __Layout,
};