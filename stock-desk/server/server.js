/**
 * Standalone version of the data server for hosting anywhere that
 * runs a persistent Node process (a VPS, Render, Railway, Fly.io,
 * etc.) -- NOT needed if you're deploying to Netlify, which uses
 * netlify/functions/stock.js instead. Both share the same logic
 * from lib/stockLogic.js.
 */

const express = require("express");
const cors = require("cors");
const { getStockData } = require("../lib/stockLogic");

const app = express();
app.use(cors()); // fine open for a personal project; restrict to your
                  // frontend's origin before exposing this publicly.

const PORT = process.env.PORT || 3001;

app.get("/api/stock", async (req, res) => {
  try {
    const result = await getStockData(req.query.ticker);
    res.json(result);
  } catch (err) {
    console.error(`[stock:${req.query.ticker}]`, err.message);
    res.status(err.status || 500).json({ error: err.message || "Lookup failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Stock Research Desk data server listening on http://localhost:${PORT}`);
});

/**
 * FALLBACK / EXTENSION IDEAS
 * - If Yahoo starts consistently failing (crumb/cookie changes, IP
 *   rate-limiting): swap `yahooFinance.chart()` for a Stooq CSV fetch
 *   (https://stooq.com/q/d/l/?s=AAPL.US&i=m) for the price history --
 *   it's free, keyless, and covers US/UK/DE/JP/HK -- but has no
 *   fundamentals (market cap, beta, D/E, dividend, analyst target).
 * - For US-listed tickers specifically, Finnhub's free tier
 *   (60 req/min, https://finnhub.io) is a more stable *official* free
 *   API for quote + basic fundamentals, but its free plan doesn't
 *   cover international exchanges (Tokyo, Shenzhen, Frankfurt), so it
 *   can't fully replace Yahoo for this app's watchlist.
 * - Add a simple in-memory cache (e.g. a Map keyed by ticker with a
 *   5-10 minute TTL) in front of the Yahoo calls if you expect repeat
 *   lookups -- also reduces the odds of getting rate-limited.
 */
