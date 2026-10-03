import { redirect } from "next/navigation";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradeIndexPage() {
  const markets = await getMarkets();
  const cutoffSec = 1791158400; // 2026-10-05T00:00:00Z

  const tradableMarket = markets.find(
    (m) =>
      (m.status === "active" || m.status === 1) &&
      !m.title.startsWith("Unused") &&
      !m.title.startsWith("Percolator") &&
      !m.title.includes("(Record #1)") &&
      (m.closeTime ? Math.floor(new Date(m.closeTime).getTime() / 1000) >= cutoffSec : true)
  );
  const targetMarket = tradableMarket || markets.find((m) => (m.closeTime ? Math.floor(new Date(m.closeTime).getTime() / 1000) >= cutoffSec : false)) || markets[0];

  if (targetMarket) {
    redirect(`/trade/${targetMarket.slug || targetMarket.address}`);
  }

  redirect("/markets");
}
