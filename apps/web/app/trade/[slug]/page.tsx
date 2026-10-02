import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Terminal } from "@/components/terminal";
import { getMarket } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = await getMarket(slug);

  if (!market) {
    return (
      <AppShell>
        <div style={{ maxWidth: "540px", margin: "60px auto", padding: "32px 24px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}>
          <h2 style={{ fontSize: "18px", color: "#fff", marginBottom: "8px" }}>
            Market Not Found
          </h2>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.65)", margin: "0 0 20px" }}>
            The requested market could not be found or is not active.
          </p>
          <Link
            href="/markets"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 600,
              fontSize: "13px",
              padding: "10px 18px",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} />
            <span>Return to Markets</span>
          </Link>
        </div>
      </AppShell>
    );
  }

  // If market is closed, inform user cleanly
  if (market.status === "closed" || market.status === 4) {
    return (
      <AppShell>
        <div style={{ maxWidth: "540px", margin: "60px auto", padding: "32px 24px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}>
          <h2 style={{ fontSize: "18px", color: "#fff", marginBottom: "8px" }}>
            {market.title}
          </h2>
          <p style={{ fontSize: "14px", color: "#ffb400", margin: "0 0 20px" }}>
            This market is closed. Closed markets stay on-chain; hidden in the UI.
          </p>
          <Link
            href="/markets"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 600,
              fontSize: "13px",
              padding: "10px 18px",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} />
            <span>Browse Active Markets</span>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ padding: "24px" }}>
        <Terminal market={market} />
      </div>
    </AppShell>
  );
}
