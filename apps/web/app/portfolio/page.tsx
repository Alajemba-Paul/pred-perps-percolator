import { AppShell } from "@/components/app-shell";
import { PortfolioView } from "@/components/portfolio-view";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const fallbackAddress =
    process.env.MOXIE_PORTFOLIO_ADDRESS || DEVNET_DEPLOYMENT.demoTraderPortfolio;

  return (
    <AppShell>
      <PortfolioView fallbackAddress={fallbackAddress} />
    </AppShell>
  );
}
