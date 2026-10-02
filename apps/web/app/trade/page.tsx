import { redirect } from "next/navigation";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradeIndexPage() {
  const markets = await getMarkets();

  const tradableMarket = markets.find(
    (m) =>
      (m.status === "active" || m.status === 1) &&
      !m.title.startsWith("Unused") &&
      !m.title.startsWith("Percolator") &&
      !m.title.includes("(Record #1)")
  );
  const targetMarket = tradableMarket || markets[0];

  if (targetMarket) {
    redirect(`/trade/${targetMarket.slug || targetMarket.address}`);
  }

  redirect("/markets");
}
