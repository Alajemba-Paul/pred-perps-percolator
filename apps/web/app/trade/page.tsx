import { redirect } from "next/navigation";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradeIndexPage() {
  const markets = await getMarkets();

  // Pick first tradable market (status === 'active' || status === 1)
  const tradableMarket = markets.find(
    (m) => m.status === "active" || m.status === 1
  );
  const targetMarket = tradableMarket || markets[0];

  if (targetMarket) {
    redirect(`/trade/${targetMarket.slug || targetMarket.address}`);
  }

  redirect("/markets");
}
