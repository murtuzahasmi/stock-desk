/**
 * Shared core: fetches real market data from Yahoo Finance's public
 * (unofficial) endpoints and scores it with plain, editable rules --
 * no LLM involved. Used by both:
 *   - netlify/functions/stock.js  (serverless, for Netlify hosting)
 *   - server/server.js            (a plain Express server, for any
 *                                  other host -- VPS, Render, etc.)
 */

const YahooFinance = require("yahoo-finance2").default;

// v4 exports the class itself; construct an instance (this also lets
// you pass options like suppressNotices, a custom logger, etc.)
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ============================================================
// EDITABLE RULES -- the "hardcoded" logic, in one place.
// Nothing below calls an LLM; it's all plain arithmetic and string
// matching against real data. Tune it to whatever screen you trust.
// ============================================================

const HALAL_RULES = {
  // Sector/industry substrings (lowercase) that fail the business-
  // activity screen outright, regardless of financial ratios.
  // Different providers (AAOIFI, S&P/Dow Jones Islamic, MSCI Islamic,
  // Zoya, Islamicly) don't fully agree on this list -- this is a
  // reasonable, conservative default. Edit freely.
  excludedKeywords: [
    "alcohol",
    "brewer",
    "distiller",
    "tobacco",
    "casino",
    "gambling",
    "resorts & casinos",
    "adult entertainment",
    "pork",
    "banks", // conventional/interest-based banking
    "insurance", // conventional insurance
    "credit services",
    "mortgage finance",
  ],
  // Sector/industry keywords that specifically mean "conventional
  // financial institution" -- used only to decide whether the
  // name-based Islamic-finance carve-out below can apply. Widening
  // this list widens what the carve-out can override.
  conventionalFinanceKeywords: ["banks", "insurance", "credit services", "mortgage finance"],
  // Financial-ratio screen, approximating the AAOIFI / S&P Dow Jones
  // Islamic Market / MSCI Islamic style test:
  //   (1) interest-bearing debt / market cap < ~33%
  //   (2) cash + interest-bearing securities / market cap < ~33%
  // Real methodologies also check (3) receivables / market cap < 33%,
  // and several of them use a smoothed *trailing 36-month average*
  // market cap rather than today's spot price, specifically to avoid
  // a stock flipping compliance status on short-term price swings.
  // This implementation only does (1) and (2), against spot market
  // cap -- see the limitations note in the README. Treat these
  // numbers as a reasonable starting point, not a fatwa.
  ratioPct: {
    reviewAbove: 33,
    failAbove: 45,
  },
};

function classifyHalal({ name, sector, industry, marketCap, totalDebt, totalCash }) {
  const haystack = `${sector || ""} ${industry || ""}`.toLowerCase();
  const hitSector = HALAL_RULES.excludedKeywords.find((kw) => haystack.includes(kw));

  // Weak carve-out: Yahoo classifies e.g. "Dubai Islamic Bank" or
  // "Qatar Islamic Bank" under the same generic "Banks" industry as
  // any conventional bank, which would otherwise wrongly fail them
  // here. This only catches institutions that say so in their own
  // name -- it will miss ones that don't (Al Rajhi Bank, one of the
  // world's largest Islamic banks, has no "Islamic" in its name), so
  // treat a "Fail" on any bank/insurer as worth a manual check, not
  // a final answer either way.
  const looksIslamicByName = /islamic|shari(a|'a|ah)|takaful/i.test(name || "");
  const isConventionalFinanceHit = hitSector && HALAL_RULES.conventionalFinanceKeywords.includes(hitSector);

  if (hitSector && !(looksIslamicByName && isConventionalFinanceHit)) {
    return {
      halal: "Fail",
      halalNote: `Business activity ("${industry || sector}") matches excluded category "${hitSector}".`,
    };
  }

  if (typeof marketCap !== "number" || marketCap <= 0) {
    return {
      halal: "Review",
      halalNote: "Business activity looks clear, but market cap wasn't available to screen the debt/cash ratios.",
    };
  }

  const debtRatio = typeof totalDebt === "number" ? (totalDebt / marketCap) * 100 : null;
  const cashRatio = typeof totalCash === "number" ? (totalCash / marketCap) * 100 : null;

  if (debtRatio === null && cashRatio === null) {
    return {
      halal: "Review",
      halalNote: "Business activity looks clear, but debt/cash figures weren't available to screen leverage.",
    };
  }

  const failed = [];
  const reviewed = [];
  if (debtRatio !== null) {
    if (debtRatio > HALAL_RULES.ratioPct.failAbove) failed.push(`debt ${debtRatio.toFixed(1)}%`);
    else if (debtRatio > HALAL_RULES.ratioPct.reviewAbove) reviewed.push(`debt ${debtRatio.toFixed(1)}%`);
  }
  if (cashRatio !== null) {
    if (cashRatio > HALAL_RULES.ratioPct.failAbove) failed.push(`cash/securities ${cashRatio.toFixed(1)}%`);
    else if (cashRatio > HALAL_RULES.ratioPct.reviewAbove) reviewed.push(`cash/securities ${cashRatio.toFixed(1)}%`);
  }

  if (failed.length) {
    return {
      halal: "Fail",
      halalNote: `${failed.join(" and ")} of market cap exceeds the ${HALAL_RULES.ratioPct.failAbove}% limit. (Receivables ratio not screened -- unavailable for free.)`,
    };
  }
  if (reviewed.length) {
    return {
      halal: "Review",
      halalNote: `${reviewed.join(" and ")} of market cap is above the ${HALAL_RULES.ratioPct.reviewAbove}% comfort threshold. (Receivables ratio not screened -- unavailable for free.)`,
    };
  }

  const parts = [];
  if (debtRatio !== null) parts.push(`debt ${debtRatio.toFixed(1)}%`);
  if (cashRatio !== null) parts.push(`cash/securities ${cashRatio.toFixed(1)}%`);
  return {
    halal: "Pass",
    halalNote: `Business activity clear; ${parts.join(" and ")} of market cap, both within threshold. (Receivables ratio not screened -- unavailable for free.)`,
  };
}

// Trend is classified from the trailing ~12 monthly closes: direction
// (% change first-to-last) plus a volatility check (stdev of monthly
// returns) so a choppy-but-flat stock reads as "Volatile" rather than
// "Rangebound".
function classifyTrend(history) {
  if (!Array.isArray(history) || history.length < 3) {
    return { trend: "Rangebound", trendNote: "Not enough price history to classify a trend." };
  }

  const first = history[0].p;
  const last = history[history.length - 1].p;
  const pctChange = ((last - first) / first) * 100;

  const returns = [];
  for (let i = 1; i < history.length; i++) {
    returns.push((history[i].p - history[i - 1].p) / history[i - 1].p);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const stdevPct = Math.sqrt(variance) * 100;

  let trend;
  if (stdevPct > 9) trend = "Volatile";
  else if (pctChange > 10) trend = "Uptrend";
  else if (pctChange < -10) trend = "Downtrend";
  else trend = "Rangebound";

  const trendNote = `${pctChange >= 0 ? "Up" : "Down"} ${Math.abs(pctChange).toFixed(1)}% over the trailing 12 months (month-to-month swing: ~${stdevPct.toFixed(1)}%).`;

  return { trend, trendNote };
}

// Purely data-driven "biggest risk" line. This is the piece that
// loses the most going from an LLM (which could reason about current
// news) to hardcoded rules -- it can only flag what the numbers show.
function buildRiskNote({ beta, debtToEquity, vsAthPct }) {
  if (typeof beta === "number" && beta >= 1.5) {
    return `High beta (${beta.toFixed(2)}) -- this tends to move more sharply than the broader market.`;
  }
  if (typeof debtToEquity === "number" && debtToEquity >= HALAL_RULES.ratioPct.failAbove) {
    return `Elevated leverage (debt/equity ${debtToEquity.toFixed(1)}%) increases sensitivity to rate changes.`;
  }
  if (typeof vsAthPct === "number" && vsAthPct <= -40) {
    return `Trading ${Math.abs(vsAthPct).toFixed(1)}% below its all-time high -- worth checking what drove the drawdown.`;
  }
  return "No single dominant red flag in the screened metrics -- check recent news and earnings yourself.";
}

const RATING_LABELS = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
  strong_sell: "Strong Sell",
  none: null,
};

function fmtCompact(n, currency) {
  if (typeof n !== "number") return null;
  const abbrev =
    n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` :
    n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` :
    n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` :
    n.toLocaleString();
  return currency ? `${currency} ${abbrev}` : abbrev;
}

function truncateWords(text, maxWords) {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ") + "\u2026";
}

function monthLabel(date) {
  const d = new Date(date);
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${month} '${year}`;
}

function shortDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Main entry point: fetch + assemble everything for one ticker.
 * Throws an Error (with an optional `.status`) on failure -- callers
 * (the Netlify function, the Express route) turn that into an HTTP
 * response however fits their framework.
 */
async function getStockData(rawTicker) {
  const ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker) {
    const err = new Error("Missing ticker");
    err.status = 400;
    throw err;
  }

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setMonth(oneYearAgo.getMonth() - 13);

    const [summary, yearChart, fullChart] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
      }),
      yahooFinance.chart(ticker, { period1: oneYearAgo, interval: "1mo" }),
      // Monthly candles back to 1970 for an all-time-high estimate.
      // Interval is coarse (1mo) specifically to keep this payload small.
      yahooFinance.chart(ticker, { period1: new Date("1970-01-01"), interval: "1mo" }).catch(() => null),
    ]);

    const price = summary.price || {};
    const summaryDetail = summary.summaryDetail || {};
    const keyStats = summary.defaultKeyStatistics || {};
    const financialData = summary.financialData || {};
    const assetProfile = summary.assetProfile || {};

    const currency = price.currency || summaryDetail.currency || yearChart?.meta?.currency || "USD";
    const currentPrice = price.regularMarketPrice ?? yearChart?.meta?.regularMarketPrice ?? null;

    // --- price history for the chart, oldest first ---
    const priceHistory = (yearChart?.quotes || [])
      .filter((q) => typeof q.close === "number")
      .map((q) => ({ t: monthLabel(q.date), p: Number(q.close.toFixed(2)) }))
      .slice(-12);

    // --- all-time high, from the full-range monthly series ---
    let athPrice = null;
    let athDate = null;
    const fullQuotes = (fullChart?.quotes || []).filter((q) => typeof q.close === "number");
    if (fullQuotes.length) {
      const athQuote = fullQuotes.reduce((max, q) => (q.close > max.close ? q : max), fullQuotes[0]);
      athPrice = Number(athQuote.close.toFixed(2));
      athDate = shortDate(athQuote.date);
    }

    const vsAthPct =
      typeof currentPrice === "number" && typeof athPrice === "number" && athPrice > 0
        ? Number((((currentPrice - athPrice) / athPrice) * 100).toFixed(1))
        : null;

    const debtToEquity = typeof financialData.debtToEquity === "number" ? financialData.debtToEquity : null;
    const beta = typeof keyStats.beta === "number" ? keyStats.beta : typeof summaryDetail.beta === "number" ? summaryDetail.beta : null;

    // Raw numeric market cap (needed for the ratio math below) --
    // separate from `mktCap`, the compact display string built later.
    const marketCapRaw = typeof summaryDetail.marketCap === "number" ? summaryDetail.marketCap : typeof price.marketCap === "number" ? price.marketCap : null;
    const totalDebt = typeof financialData.totalDebt === "number" ? financialData.totalDebt : null;
    const totalCash = typeof financialData.totalCash === "number" ? financialData.totalCash : null;

    const halalResult = classifyHalal({
      name: price.longName || price.shortName || ticker,
      sector: assetProfile.sector,
      industry: assetProfile.industry,
      marketCap: marketCapRaw,
      totalDebt,
      totalCash,
    });
    const trendResult = classifyTrend(priceHistory);
    const risk = buildRiskNote({ beta, debtToEquity, vsAthPct });

    const divYieldPct =
      typeof summaryDetail.dividendYield === "number" ? `${(summaryDetail.dividendYield * 100).toFixed(2)}%` : "None";

    const ratingKey = (financialData.recommendationKey || "").toLowerCase();
    const rating = RATING_LABELS[ratingKey] ?? (ratingKey ? ratingKey : null);

    return {
      ticker,
      name: price.longName || price.shortName || ticker,
      currency,
      price: currentPrice,
      asOf: shortDate(price.regularMarketTime) || shortDate(new Date()),
      wk52Hi: summaryDetail.fiftyTwoWeekHigh ?? yearChart?.meta?.fiftyTwoWeekHigh ?? null,
      wk52Lo: summaryDetail.fiftyTwoWeekLow ?? yearChart?.meta?.fiftyTwoWeekLow ?? null,
      athPrice,
      athDate,
      vsAthPct,
      priceHistory,
      mktCap: fmtCompact(marketCapRaw, "") || null,
      de: debtToEquity !== null ? `${debtToEquity.toFixed(1)}%` : null,
      beta,
      divYield: divYieldPct,
      targetPrice: typeof financialData.targetMeanPrice === "number" ? financialData.targetMeanPrice : null,
      rating,
      sector: assetProfile.sector || null,
      desc: truncateWords(assetProfile.longBusinessSummary, 15),
      halal: halalResult.halal,
      halalNote: halalResult.halalNote,
      trend: trendResult.trend,
      trendNote: trendResult.trendNote,
      risk,
    };
  } catch (err) {
    if (err.status) throw err;
    const wrapped = new Error(
      `Couldn't find live data for "${ticker}". Check the ticker/exchange suffix (e.g. 6594.T, 002050.SZ), or Yahoo's unofficial endpoint may be temporarily blocking this server.`
    );
    wrapped.status = 404;
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = { getStockData, classifyHalal, classifyTrend, buildRiskNote, HALAL_RULES };
