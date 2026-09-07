import { useState, useRef, useEffect } from "react";
import { Search, TrendingUp, TrendingDown, Minus, AlertCircle, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

const INK = "#0F1826";
const INK_2 = "#182337";
const FOG = "#8C93A6";
const PARCHMENT = "#F4EFE2";
const PARCHMENT_LINE = "#DCD3B9";
const INK_TEXT = "#211E19";
const BRASS = "#AD8A3D";
const RUST = "#A8432A";
const PINE = "#33513A";

const QUICK_PICKS = [
  { label: "MP Materials", ticker: "MP" },
  { label: "Nidec", ticker: "6594.T" },
  { label: "AMETEK", ticker: "AME" },
  { label: "Harmonic Drive", ticker: "6324.T" },
  { label: "NSK", ticker: "6471.T" },
  { label: "Schaeffler", ticker: "SHA0.DE" },
  { label: "Sanhua", ticker: "002050.SZ" },
];

const LOADING_LINES = [
  "Pulling the tape\u2026",
  "Checking the 52-week ledger\u2026",
  "Reading the balance sheet\u2026",
  "Cross-checking analyst notes\u2026",
];

// Relative path: on Netlify, netlify.toml redirects /api/* to the
// serverless function. For local dev without `netlify dev`, vite.config.js
// proxies /api to a locally-running Express server instead (npm run server).
const API_BASE_URL = "";

function fmtNum(n, currency) {
  if (n === null || n === undefined || Number.isNaN(n)) return "\u2014";
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

function trendLineColor(history) {
  if (!Array.isArray(history) || history.length < 2) return BRASS;
  const first = history[0]?.p;
  const last = history[history.length - 1]?.p;
  if (typeof first !== "number" || typeof last !== "number") return BRASS;
  return last >= first ? PINE : RUST;
}

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: INK_TEXT,
        color: PARCHMENT,
        padding: "4px 8px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        border: `1px solid ${BRASS}`,
      }}
    >
      {label} {"\u00b7"} {fmtNum(payload[0].value, currency)}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div
      className="flex items-baseline justify-between py-2"
      style={{ borderBottom: `1px solid ${PARCHMENT_LINE}` }}
    >
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6B6455", letterSpacing: 0.3 }}>
        {label}
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: INK_TEXT, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function TrendBadge({ trend }) {
  const map = {
    Uptrend: { color: PINE, Icon: TrendingUp },
    Downtrend: { color: RUST, Icon: TrendingDown },
    Volatile: { color: BRASS, Icon: TrendingUp },
    Rangebound: { color: "#6B6455", Icon: Minus },
  };
  const cfg = map[trend] || map.Rangebound;
  const Icon = cfg.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1"
      style={{ border: `1px solid ${cfg.color}`, color: cfg.color, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {trend}
    </span>
  );
}

function HalalStamp({ halal }) {
  const map = {
    Pass: { color: PINE, label: "HALAL \u2014 PASS" },
    Fail: { color: RUST, label: "HALAL \u2014 FAIL" },
    Review: { color: BRASS, label: "HALAL \u2014 REVIEW" },
  };
  const cfg = map[halal] || map.Review;
  return (
    <div
      className="stamp-in"
      style={{
        border: `2px solid ${cfg.color}`,
        color: cfg.color,
        transform: "rotate(-7deg)",
        padding: "6px 10px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 1,
        whiteSpace: "nowrap",
        borderRadius: 2,
      }}
    >
      {cfg.label}
    </div>
  );
}

export default function StockResearchDesk() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const loadingTimer = useRef(null);

  useEffect(() => {
    if (loading) {
      let i = 0;
      loadingTimer.current = setInterval(() => {
        i = (i + 1) % LOADING_LINES.length;
        setLoadingLine(LOADING_LINES[i]);
      }, 1400);
    } else {
      clearInterval(loadingTimer.current);
    }
    return () => clearInterval(loadingTimer.current);
  }, [loading]);

  async function runLookup(ticker) {
    const q = (ticker || input).trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/stock?ticker=${encodeURIComponent(q)}`);
      const parsed = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error((parsed && parsed.error) || `Request failed (${resp.status})`);
      if (!parsed || parsed.error) throw new Error((parsed && parsed.error) || "Could not read a result for that ticker.");
      setData(parsed);
      setHistory((h) => [q, ...h.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6));
      setInput(q);
    } catch (e) {
      setError(e.message || "Something went wrong pulling that data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-4 py-10"
      style={{ background: INK, fontFamily: "'Source Serif 4', Georgia, serif" }}
    >
      <style>{`
        ${FONT_IMPORT}
        @keyframes stampIn {
          0% { opacity: 0; transform: rotate(-7deg) scale(1.6); }
          60% { opacity: 1; transform: rotate(-7deg) scale(0.92); }
          100% { opacity: 1; transform: rotate(-7deg) scale(1); }
        }
        .stamp-in { animation: stampIn 0.5s ease-out; }
        input::placeholder { color: #5A6478; }
      `}</style>

      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, color: FOG }}
          >
            STOCK RESEARCH DESK
          </div>
          <h1 style={{ color: PARCHMENT, fontSize: 28, fontWeight: 600, marginTop: 6 }}>
            One ticker, the whole ledger.
          </h1>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runLookup();
          }}
          className="flex items-center gap-2 mb-4 px-4 py-3"
          style={{ background: INK_2, border: `1px solid #2A3752` }}
        >
          <span style={{ color: BRASS, fontFamily: "'IBM Plex Mono', monospace" }}>$</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ticker or company (e.g. AME, 6324.T, 002050.SZ)"
            className="flex-1 bg-transparent outline-none"
            style={{ color: PARCHMENT, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2"
            style={{ background: BRASS, color: INK, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            ANALYZE
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mb-8">
          {QUICK_PICKS.map((q) => (
            <button
              key={q.ticker}
              onClick={() => runLookup(q.ticker)}
              disabled={loading}
              className="px-2 py-1"
              style={{
                border: `1px solid #2A3752`,
                color: FOG,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                background: "transparent",
              }}
            >
              {q.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-10" style={{ color: FOG, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
            {loadingLine}
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-start gap-2 px-4 py-3 mb-6"
            style={{ border: `1px solid ${RUST}`, color: "#E8B4A5", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        {!loading && data && (
          <div style={{ background: PARCHMENT, padding: 28, position: "relative" }}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 style={{ color: INK_TEXT, fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{data.name}</h2>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#6B6455", marginTop: 2 }}>
                  {data.ticker} {"\u00b7"} as of {data.asOf}
                </div>
              </div>
              <HalalStamp halal={data.halal} />
            </div>

            <div className="flex items-baseline gap-3 mt-4 mb-2">
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 600, color: INK_TEXT }}>
                {fmtNum(data.price, data.currency)}
              </span>
              {typeof data.vsAthPct === "number" && (
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 13,
                    color: data.vsAthPct >= 0 ? PINE : RUST,
                  }}
                >
                  {data.vsAthPct >= 0 ? "\u2191" : "\u2193"} {Math.abs(data.vsAthPct).toFixed(1)}% vs all-time high
                </span>
              )}
            </div>

            <div className="mb-4">
              <TrendBadge trend={data.trend} />
            </div>

            {Array.isArray(data.priceHistory) && data.priceHistory.length > 1 ? (
              <div className="mb-5">
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: "#8A806C",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                  }}
                >
                  1-YEAR TREND
                </div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.priceHistory} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                      <XAxis
                        dataKey="t"
                        tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: "#8A806C" }}
                        axisLine={{ stroke: PARCHMENT_LINE }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip content={<ChartTooltip currency={data.currency} />} />
                      <Line
                        type="monotone"
                        dataKey="p"
                        stroke={trendLineColor(data.priceHistory)}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: trendLineColor(data.priceHistory) }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div
                className="mb-5"
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8A806C" }}
              >
                1-year trend chart unavailable for this lookup.
              </div>
            )}

            <p style={{ color: "#4A4438", fontSize: 15, lineHeight: 1.5, marginBottom: 20 }}>
              {data.desc} <span style={{ color: "#8A806C" }}>&mdash; {data.sector}</span>
            </p>

            <div className="mb-2">
              <Row label="52-WEEK HIGH" value={fmtNum(data.wk52Hi, data.currency)} />
              <Row label="52-WEEK LOW" value={fmtNum(data.wk52Lo, data.currency)} />
              <Row label="ALL-TIME HIGH" value={`${fmtNum(data.athPrice, data.currency)}  (${data.athDate})`} />
              <Row label="MARKET CAP" value={data.mktCap ?? "\u2014"} />
              <Row label="DEBT / EQUITY" value={data.de ?? "\u2014"} />
              <Row label="BETA" value={data.beta ?? "\u2014"} />
              <Row label="DIVIDEND YIELD" value={data.divYield ?? "\u2014"} />
              <Row label="ANALYST TARGET" value={data.targetPrice ? `${fmtNum(data.targetPrice, data.currency)} \u00b7 ${data.rating}` : (data.rating ?? "\u2014")} />
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${PARCHMENT_LINE}` }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A806C", letterSpacing: 0.5, marginBottom: 4 }}>
                HALAL NOTE
              </div>
              <p style={{ color: "#4A4438", fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>{data.halalNote}</p>

              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A806C", letterSpacing: 0.5, marginBottom: 4 }}>
                TREND NOTE
              </div>
              <p style={{ color: "#4A4438", fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>{data.trendNote}</p>

              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8A806C", letterSpacing: 0.5, marginBottom: 4 }}>
                KEY RISK
              </div>
              <p style={{ color: "#4A4438", fontSize: 14, lineHeight: 1.5 }}>{data.risk}</p>
            </div>
          </div>
        )}

        {!loading && !data && !error && (
          <div className="text-center py-14" style={{ color: "#4A5670", fontSize: 14 }}>
            Type a ticker above, or pick one from the desk's watchlist.
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-8">
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 1, color: FOG, marginBottom: 8 }}>
              RECENT LOOKUPS
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <button
                  key={h}
                  onClick={() => runLookup(h)}
                  className="px-2 py-1"
                  style={{ border: `1px solid #2A3752`, color: PARCHMENT, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, background: "transparent" }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 text-center" style={{ color: "#4A5670", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
          Figures are pulled live from free market-data endpoints and can be wrong, stale, or delayed {"\u2014"} verify before acting.
          <br />
          Halal screen is a partial, editable ratio-based rule set (see lib/stockLogic.js) covering 2 of 3 standard AAOIFI-style ratios, not a certified Sharia compliance check.
        </div>
      </div>
    </div>
  );
}
