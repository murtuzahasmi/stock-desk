# Stock Research Desk

A React research card that pulls live-ish market data (price, 52-week
range, all-time high, market cap, beta, dividend yield, analyst
target, a 1-year trend chart) and screens it with a small, fully
editable, deterministic rule set for "halal", trend, and risk — no
LLM calls anywhere in the running app.

## Project layout

```
stock-desk/
├── src/
│   ├── main.jsx                  # mounts the component
│   └── StockResearchDesk.jsx     # the UI
├── lib/
│   └── stockLogic.js             # shared: fetches Yahoo data, scores it
├── netlify/functions/stock.js    # serverless entry point (for Netlify)
├── server/server.js              # plain Express entry point (for anywhere else)
├── netlify.toml                  # Netlify build + redirect config
├── vite.config.js
├── index.html
└── package.json
```

`lib/stockLogic.js` is the actual brain (Yahoo Finance calls + the
halal/trend/risk rules). The Netlify function and the Express server
are both thin wrappers around it, so you only maintain the logic once
no matter which way you host it.

## Deploying to Netlify

1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. In Netlify: **Add new site → Import an existing project**, pick the
   repo. Netlify will read `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. Deploy. That's it — no environment variables or API keys needed,
   since Yahoo's endpoints don't require one.

The frontend calls `/api/stock?ticker=...`; the redirect in
`netlify.toml` routes that to `/.netlify/functions/stock`, which runs
`lib/stockLogic.js` server-side (where Yahoo's lack of CORS headers
doesn't matter).

**Local dev against Netlify's own setup:** install the
[Netlify CLI](https://docs.netlify.com/cli/get-started/) and run
`netlify dev` from the project root — it serves the Vite app *and*
runs the function locally behind the same `/api/*` redirect, so it
matches production exactly.

**Local dev without the Netlify CLI:** run `npm run server` (starts
the Express version on port 3001) in one terminal and `npm run dev`
(Vite) in another — `vite.config.js` proxies `/api` to that Express
server for you.

### A note on cold starts

Netlify Functions are serverless — each cold invocation may redo
Yahoo's cookie/crumb handshake before it can fetch real data, adding
a bit of latency to the first lookup after idle time. Totally fine
for a personal tool; if it bothers you, the standalone Express server
(`server/server.js`) on a small always-on host (a $5 VPS, Render,
Fly.io) keeps a single warm process and avoids this.

## Editing the halal screen

Everything is in the `HALAL_RULES` object near the top of
`lib/stockLogic.js`:

```js
const HALAL_RULES = {
  excludedKeywords: [ "alcohol", "tobacco", "casino", "banks", ... ],
  debtEquityPct: { reviewAbove: 33, failAbove: 45 },
};
```

- `excludedKeywords` is matched against Yahoo's `sector` + `industry`
  strings (lowercase substring match). Add/remove terms freely.
- `debtEquityPct` are thresholds on Yahoo's reported debt/equity (%),
  used as a stand-in for the "debt / market cap < 33%" style screen
  used by AAOIFI/S&P/MSCI Islamic indices, since a free source for the
  exact ratio isn't readily available. Different screening providers
  disagree on exact numbers — treat this as a reasonable, adjustable
  default, not a fatwa. It's flagged as such in the UI footer too.

## What data comes from where

| Field(s) | Source |
|---|---|
| Price, currency, 52-week hi/lo, market cap, beta, dividend yield, analyst target/rating, sector, description | Yahoo `quoteSummary` (`price`, `summaryDetail`, `defaultKeyStatistics`, `financialData`, `assetProfile` modules) |
| 1-year price history (chart) | Yahoo `chart`, monthly candles over the trailing 13 months |
| All-time high + date | Yahoo `chart`, monthly candles back to 1970 — takes the max close |
| Halal verdict + note | **Computed locally**, see above |
| Trend + trend note | **Computed locally** — % change and volatility across the trailing 12 monthly closes |
| Risk note | **Computed locally** — a small decision tree over beta, debt/equity, and distance from all-time high |

## Known limitations, honestly

- **Yahoo's endpoints are unofficial.** They can change shape, add
  stricter cookie/crumb requirements, or rate-limit an IP without
  notice. Fine for a personal tool; not something to build a business
  on without a paid data vendor as backup.
- **No single free source covers everything for every ticker.**
  Finnhub's free tier has great US fundamentals but doesn't include
  international exchanges (Tokyo, Shenzhen, Frankfurt) — which is most
  of this app's watchlist — so it can't fully replace Yahoo here.
  Stooq covers international price history for free but has no
  fundamentals (market cap, beta, D/E, etc.) at all.
- **The risk note lost its "read the news" superpower.** The old
  Claude-plus-search version could reason about breaking news. The
  hardcoded version can only flag what beta/leverage/drawdown show —
  still useful, just more mechanical.
