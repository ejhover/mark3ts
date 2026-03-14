# MoneyBuddy

Educational market research workspace with:
- News ingestion and AI analysis
- Signal-based hypothesis generation
- Paper portfolio simulation driven by analyzed news signals

No real-money trading is performed.

## Local Run

1. Install dependencies:
	- `npm install`
2. Start backend:
	- `npm run server`
3. Start frontend:
	- `npm run dev`

## Finnhub Configuration

Set these in `.env`:
- `FINNHUB_API_KEY`: required for live quotes and history
- `FINNHUB_WEBHOOK_SECRET`: optional, required only if using Finnhub webhooks

### Webhook Setup

In Finnhub webhook settings:
- URL: `https://<your-domain>/api/finnhub/webhook`
- Secret: same value as `FINNHUB_WEBHOOK_SECRET`

Security behavior implemented by backend:
- Validates request header `X-Finnhub-Secret`
- Returns 2xx ack immediately for valid requests
- Rejects invalid secret with 403

## Educational Investing Simulation Flow

1. Ingest and analyze news in News Feed.
2. Open Portfolio Simulator.
3. Create a "News Signal Basket" with fake capital.
4. Simulator allocates across symbols using all analyzed backend news items:
	- Per-article signal magnitudes influence allocation weights
	- Bullish signals create paper long positions
	- Bearish signals create paper short positions
5. Run simulation to compute paper performance and historical curve.
6. Live updates stream current paper value with Finnhub quotes.

## Background Analysis and Pruning

Backend continuously runs retention and analysis maintenance:
- Prunes with importance policy/cap
- Runs two-pass analysis (fast pass + deep selection)

Maintenance endpoints:
- `POST /api/news/maintenance/prune`
- `POST /api/news/maintenance/analyze`
- `POST /api/news/maintenance/prune-and-analyze`
- `POST /api/news/maintenance/run`
- `GET /api/news/maintenance/run`