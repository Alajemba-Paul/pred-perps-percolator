import { AppShell } from "@/components/app-shell";
import { TechnologyMotionExplainer } from "@/components/technology-motion-explainer";

export default function TechnologyPage() {
  return (
    <AppShell>
      <div className="technology-page" style={{ padding: "40px 24px", maxWidth: "1280px", margin: "0 auto" }}>
        <section className="technology-hero">
          <p className="eyebrow">THE ARCHITECTURE</p>
          <h1>
            Every trade has<br />
            <span>a cryptographic chain of proof.</span>
          </h1>
          <p>
            Moxie separates event discovery, price formation and solvency — then makes the boundary between them visible.
            Operating exclusively on Solana Devnet.
          </p>
          <div className="tech-status">
            <span><i /> ORACLE REPORTER</span>
            <span><i /> MATCHER DELEGATE</span>
            <span><i /> PERCOLATOR V16</span>
            <em>DEVNET LIVE</em>
          </div>
        </section>

        <section style={{ margin: "40px 0" }}>
          <TechnologyMotionExplainer />
        </section>

        <section className="truth-table">
          <div>
            <p className="section-index">RESPONSIBILITY BOUNDARIES</p>
            <h2>Know what moves what.</h2>
          </div>
          <dl>
            <div>
              <dt>External Venue (Jupiter / Polymarket)</dt>
              <dd>Event definition, outcome token IDs, rules manifest and external reference probability.</dd>
            </div>
            <div>
              <dt>Moxie Oracle Record</dt>
              <dd>Authenticated observation sequences published via CPI PushAuthMark into Percolator.</dd>
            </div>
            <div>
              <dt>Moxie Matcher (LP)</dt>
              <dd>Taker-signed TradeCpi execution against counterparty context and LP inventory.</dd>
            </div>
            <div>
              <dt>Percolator Engine (v16)</dt>
              <dd>10,000 bps exact solvency envelope, shared cross-margin collateral, and one-way terminal settlement.</dd>
            </div>
          </dl>
        </section>
      </div>
    </AppShell>
  );
}
