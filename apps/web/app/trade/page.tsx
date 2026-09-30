import { redirect } from "next/navigation";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradeIndexPage() {
  const markets = await getMarkets();
  const activeMarket = markets.find((m) => m.status === "active") || markets[0];

  if (activeMarket) {
    redirect(`/trade/${activeMarket.slug || activeMarket.address}`);
  }

  redirect("/markets");
}
