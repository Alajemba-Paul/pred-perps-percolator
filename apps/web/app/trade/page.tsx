import { redirect } from "next/navigation";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradeIndexPage() {
  const markets = await getMarkets();

  // Only link Trade to a market from GET /v1/markets whose status is active
  const activeMarket = markets.find(
    (m) =>
      (m.status === "active" || m.status === 1) &&
      !m.title.startsWith("Unused") &&
      !m.title.startsWith("Percolator Collateral") &&
      !m.title.includes("(Record #1)")
  );

  if (activeMarket) {
    redirect(`/trade/${activeMarket.slug || activeMarket.address}`);
  }

  redirect("/markets");
}
