import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Terminal } from "@/components/terminal";
import { getMarket } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = await getMarket(slug);

  // If the id is missing, closed, or not active, redirect to /markets and do not render Long/Short
  if (!market || (market.status !== "active" && market.status !== 1)) {
    redirect("/markets");
  }

  return (
    <AppShell>
      <div style={{ padding: "24px" }}>
        <Terminal market={market} />
      </div>
    </AppShell>
  );
}
