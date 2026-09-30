import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Terminal } from "@/components/terminal";
import { getMarket } from "@/lib/api";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = await getMarket(slug);

  if (!market) {
    return (
      <AppShell>
        <div style={{ maxWidth: "600px", margin: "60px auto", padding: "36px 24px", textAlign: "center", background: "rgba(255,77,77,0.04)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "8px" }}>
          <div style={{ display: "inline-flex", padding: "12px", background: "rgba(255,77,77,0.1)", borderRadius: "50%", color: "#ff4d4d", marginBottom: "12px" }}>
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontSize: "18px", color: "#fff", marginBottom: "8px" }}>
            Live Market Unavailable — Indexer / Bootstrap Offline
          </h2>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", margin: "0 0 20px", lineHeight: 1.5 }}>
            The requested market <code style={{ color: "#c7ff4a" }}>{slug}</code> could not be loaded from the indexer or Solana Devnet.
          </p>
          <Link
            href="/markets"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 600,
              fontSize: "13px",
              padding: "10px 20px",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} />
            <span>Return to Live Markets</span>
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
