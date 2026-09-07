/**
 * Netlify Function: GET /.netlify/functions/stock?ticker=AME
 * (mapped to /api/stock?ticker=... by the redirect in netlify.toml)
 *
 * This runs on Netlify's Lambda-based Functions runtime -- each
 * request may hit a cold container, which means yahoo-finance2 may
 * redo its cookie/crumb handshake with Yahoo more often than a
 * long-running server would. Expect a bit more latency on cold
 * starts; it still works fine for a personal research tool.
 */

const { getStockData } = require("../../lib/stockLogic");

exports.handler = async (event) => {
  const ticker = (event.queryStringParameters && event.queryStringParameters.ticker) || "";

  try {
    const result = await getStockData(ticker);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error(`[stock:${ticker}]`, err.message);
    return {
      statusCode: err.status || 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Lookup failed." }),
    };
  }
};
