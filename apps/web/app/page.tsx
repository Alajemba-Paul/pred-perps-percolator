import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Moxie — Prediction Markets on Solana",
  description: "Trade prediction markets with instant settlement and perpetual liquidity on Solana Devnet.",
};

export default function HomePage() {
  return (
    <div className="landing-layout" style={{ minHeight: "100vh", background: "#060809", color: "#f3f5f7", display: "flex", flexDirection: "column" }}>
      <SiteHeader floating />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "120px 24px 60px", maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ marginBottom: "20px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 12px",
              background: "rgba(199,255,74,0.1)",
              border: "1px solid rgba(199,255,74,0.25)",
              color: "#c7ff4a",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Solana Devnet Demo
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px", color: "#fff", letterSpacing: "-0.02em" }}>
          Trade Real-World Events With Perpetual Liquidity
        </h1>

        <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", maxWidth: "620px", margin: "0 auto 36px", lineHeight: 1.6 }}>
          Buy YES or NO on sports, esports, and prediction markets priced in cents. Fully collateralized and settled on Solana.
        </p>

        <div>
          <Link
            href="/markets"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 700,
              fontSize: "15px",
              padding: "16px 32px",
              borderRadius: "6px",
              textDecoration: "none",
              transition: "transform 0.15s ease",
            }}
          >
            <span>Explore Markets</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </main>

      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "24px",
          maxWidth: "1000px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          fontSize: "12px",
          color: "rgba(255,255,255,0.4)",
          boxSizing: "border-box",
        }}
      >
        <span>© 2026 Moxie • Solana Devnet</span>
        <div style={{ display: "flex", gap: "16px" }}>
          <Link href="/markets" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Markets</Link>
          <Link href="/trade" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Trade</Link>
          <Link href="/portfolio" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Portfolio</Link>
          <Link href="/technology" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Technology</Link>
          <a href="https://github.com/Alajemba-Paul/pred-perps-percolator" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>GitHub</a>
        </div>
      </footer>
    </div>
  );
}
