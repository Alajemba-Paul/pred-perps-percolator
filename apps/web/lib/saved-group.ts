import fs from "node:fs";
import { DEVNET_DEPLOYMENT } from "./contracts";

export function applySavedGroup() {
  for (const file of ["deployments/devnet-markets.json", "public/group.json", "apps/web/public/group.json"]) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof raw.marketGroup === "string") DEVNET_DEPLOYMENT.marketAccount = raw.marketGroup;
      if (typeof raw.usdcMint === "string") DEVNET_DEPLOYMENT.usdcMint = raw.usdcMint;
      if (typeof raw.collateralVault === "string") DEVNET_DEPLOYMENT.collateralVault = raw.collateralVault;
      if (typeof raw.vaultAuthority === "string") DEVNET_DEPLOYMENT.vaultAuthority = raw.vaultAuthority;
      if (typeof raw.oracleConfig === "string") DEVNET_DEPLOYMENT.oracleConfig = raw.oracleConfig;
      return;
    } catch {
      // The next path may be the one this process can see.
    }
  }
}
