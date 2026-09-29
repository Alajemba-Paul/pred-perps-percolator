"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { WalletControl } from "./wallet-control";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

export function SiteHeader({ floating = false }: { floating?: boolean }) {
  const path = usePathname();
  const tradeHref = `/trade/${DEVNET_DEPLOYMENT.importedRecord}`;

  const links = [
    ["/markets", "Markets"],
    [tradeHref, "Trade"],
    ["/portfolio", "Portfolio"],
    ["/technology", "Technology"],
  ];

  return (
    <header className={floating ? "site-header floating" : "site-header"}>
      <Link href="/" className="logo-link" aria-label="Moxie home">
        <BrandMark />
      </Link>
      <nav aria-label="Primary navigation">
        {links.map(([href, label]) => {
          const isActive =
            label === "Trade"
              ? path.startsWith("/trade")
              : path.startsWith(href);
          return (
            <Link key={`${href}-${label}`} href={href} className={isActive ? "active" : ""}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="header-actions">
        <span className="network-health" title="Connected to Solana Devnet">
          <Activity size={14} aria-hidden="true" /> Devnet
        </span>
        <WalletControl />
      </div>
    </header>
  );
}
