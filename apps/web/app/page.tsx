import Link from "next/link";
import { ArrowRight, ShieldCheck, Clock3 } from "lucide-react";
import { PriceFormation } from "@/components/price-formation";
import { SiteHeader } from "@/components/site-header";
import { TradePlayground } from "@/components/trade-playground";
import { TechnologyMotionExplainer } from "@/components/technology-motion-explainer";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const markets = await getMarkets().catch(() => []);
  const terminalHref = markets[0] ? `/trade/${markets[0].slug}` : "/markets";

  return (
    <main className="landing">
      <SiteHeader floating />
      <TradePlayground />

      <section className="live-strip" aria-label="Live markets">
        <span className="live-label"><i /> LIVE DEVNET</span>
        {markets.slice(0, 3).map((market) => (
          <Link href={`/trade/${market.slug}`} key={market.slug}>
            <span>{market.short}</span>
            <b>{market.moxie.toFixed(1)}¢</b>
            <em>{market.change === null ? "ONCHAIN" : `${market.change >= 0 ? "+" : ""}${market.change}%`}</em>
          </Link>
        ))}
        <Link className="all-markets" href="/markets">
          All markets <ArrowRight size={14} />
        </Link>
      </section>

      <section className="manifesto section-shell">
        <p className="section-index">01 / THESIS</p>
        <div>
          <h2>Markets have an opinion.<br /><span>So should the price.</span></h2>
          <p>
            External venues define the event and anchor reality. Moxie traders define the perp price
            between now and resolution on Solana Devnet.
          </p>
        </div>
      </section>

      <section id="mechanism" className="mechanism section-shell">
        <div className="section-heading">
          <p className="section-index">02 / PRICE FORMATION</p>
          <h2>One event.<br />Three signals.</h2>
          <p>Order flow moves the Moxie price. A protected mark keeps margin honest. The external index keeps the system grounded.</p>
        </div>
        <PriceFormation />
      </section>

      <section className="terminal-preview section-shell">
        <div className="terminal-copy">
          <p className="section-index">03 / EXECUTION</p>
          <h2>A terminal built for what happens next.</h2>
          <p>Price, pressure, time and risk — verified on-chain before you sign.</p>
          <Link className="text-link" href={terminalHref}>Open the terminal <ArrowRight size={16} /></Link>
        </div>
        <div className="terminal-window">
          <div className="window-top">
            <span><i /><i /><i /></span>
            <b>MOXIE / TENNIS & CRYPTO BINARY PERPS</b>
            <em>ORACLE LIVE</em>
          </div>
          <div className="window-body">
            <div className="mini-market">
              <span>MOXIE PRICE</span>
              <strong>{markets[0] ? `${markets[0].moxie.toFixed(1)}¢` : "95.9¢"}</strong>
              <em>+0.4%</em>
              <div className="mini-chart">
                <svg viewBox="0 0 500 160" preserveAspectRatio="none">
                  <path d="M0 128 C40 120 52 142 90 110 S150 86 180 101 S230 120 260 76 S300 92 340 55 S390 69 420 32 S470 43 500 18" />
                </svg>
              </div>
              <div className="chart-legend">
                <span>INDEX 95.8¢</span>
                <span>AUTH MARK 95.9¢</span>
                <span>MOXIE 95.9¢</span>
              </div>
            </div>
            <div className="mini-ticket">
              <div className="ticket-tabs"><b>BUY YES</b><span>BUY NO</span></div>
              <label>COLLATERAL <span>AVAILABLE $500</span></label>
              <div className="fake-input"><span>100.00</span><b>USDC</b></div>
              <label>LEVERAGE <span>1× (ISOLATED)</span></label>
              <div className="leverage-track"><i style={{ width: "20%" }} /></div>
              <dl>
                <div><dt>Position</dt><dd>$100</dd></div>
                <div><dt>Est. entry</dt><dd>95.9¢</dd></div>
                <div><dt>Fee (30 bps)</dt><dd>$0.30</dd></div>
              </dl>
              <Link
                href={terminalHref}
                style={{
                  display: "block",
                  textAlign: "center",
                  background: "#c7ff4a",
                  color: "#000",
                  fontWeight: 700,
                  padding: "8px",
                  borderRadius: "4px",
                  textDecoration: "none",
                  marginTop: "8px",
                  fontSize: "12px",
                }}
              >
                Open Terminal
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Section: Highly interactive motion explainer */}
      <section className="architecture section-shell" id="technology">
        <div className="section-heading compact-heading">
          <p className="section-index">04 / UNDER THE SURFACE</p>
          <h2>How Moxie Works.<br /><span>Interactive Proof Pipeline.</span></h2>
          <p>
            Explore each stage of the end-to-end prediction perp pipeline: from Jupiter event ingestion to Percolator
            solvency clearing and one-way resolution.
          </p>
        </div>

        <TechnologyMotionExplainer />
      </section>

      <section className="closing">
        <div className="closing-ring" aria-hidden="true"><i /><i /><i /></div>
        <p>THE WORLD MOVES<br />BEFORE THE CHART DOES.</p>
        <Link href="/markets">Find your market <ArrowRight size={18} /></Link>
      </section>

      <footer>
        <span>© 2026 MOXIE</span>
        <span>SOLANA DEVNET • EXPERIMENTAL</span>
        <div>
          <Link href="/technology">Technology</Link>
          <Link href="/markets">Markets</Link>
          <Link href="/portfolio">Portfolio</Link>
        </div>
      </footer>
    </main>
  );
}
