"use client";

import { useState } from "react";
import {
  Globe,
  Coins,
  ShieldCheck,
  Radio,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Code2,
  Cpu,
  Layers,
  Sparkles,
} from "lucide-react";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

const STORY_STEPS = [
  {
    step: 1,
    title: "1. We copy a real upcoming event from Jupiter",
    tagline: "Live Event Discovery",
    icon: Globe,
    color: "#4ade80",
    description:
      "Moxie imports open prediction markets directly from Jupiter on Solana. We preserve the exact event title, settlement rules, and closing deadline so traders have full clarity on how the event will resolve.",
    example: "Example: \"Dota 2: BetBoom Team vs OG\" with verified ATP / tournament rules and deadline.",
  },
  {
    step: 2,
    title: "2. Price reflects probability in cents (Long / Short)",
    tagline: "Probability Pricing",
    icon: Coins,
    color: "#60a5fa",
    description:
      "Instead of confusing multipliers, the price reflects the live market probability. If Long is trading at 56.5¢, the market estimates a 56.5% probability that the event will happen. Short is priced at the exact opposite (43.5¢).",
    example: "Long at 56.5¢ = 56.5% chance · Short at 43.5¢ = 43.5% chance.",
  },
  {
    step: 3,
    title: "3. You sign a trade on Solana Devnet with test USDC",
    tagline: "1-Click Devnet Execution",
    icon: ShieldCheck,
    color: "#c7ff4a",
    description:
      "When you choose BUY LONG or BUY SHORT, you sign a single Solana Devnet transaction with your wallet. Your trade is matched against liquidity with 100% margin backing, meaning there is zero risk of systemic bad debt.",
    example: "You deposit $50 test USDC and receive ~88 Long contracts at 56.5¢.",
  },
  {
    step: 4,
    title: "4. A simple service reads the chain and updates Markets / Portfolio",
    tagline: "Instant On-Chain Sync",
    icon: Radio,
    color: "#a78bfa",
    description:
      "Once your transaction confirms on Solana, our lightweight indexer detects the on-chain event. Your open position, unrealized profits, and locked margin appear immediately in your Portfolio and on the Trading page.",
    example: "Real-time updates without trusting off-chain centralized databases.",
  },
  {
    step: 5,
    title: "5. When the event ends, contracts settle to $1 or $0",
    tagline: "Terminal Settlement",
    icon: CheckCircle2,
    color: "#f472b6",
    description:
      "Once the real-world match or event concludes, the oracle enters the official outcome. If the event outcome occurs, Long contracts pay out $1.00 and Short goes to $0.00; otherwise Short pays $1.00. You can withdraw your settled USDC back to your wallet anytime.",
    example: "Winning contracts settle at $1.00 full value; losing contracts settle at $0.00.",
  },
];

export function TechnologyMotionExplainer() {
  const [activeStep, setActiveStep] = useState(0);
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);

  const current = STORY_STEPS[activeStep];
  const Icon = current.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "920px", margin: "0 auto" }}>
      {/* 5-Step Timeline Buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "8px",
          background: "rgba(255,255,255,0.02)",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {STORY_STEPS.map((s, idx) => {
          const isSelected = activeStep === idx;
          const StepIcon = s.icon;
          return (
            <button
              key={s.step}
              type="button"
              onClick={() => setActiveStep(idx)}
              style={{
                background: isSelected ? "rgba(255,255,255,0.08)" : "transparent",
                border: isSelected ? `1px solid ${s.color}` : "1px solid transparent",
                borderRadius: "6px",
                padding: "10px 8px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: isSelected ? s.color : "rgba(255,255,255,0.06)",
                  color: isSelected ? "#000" : "rgba(255,255,255,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                <StepIcon size={14} />
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? "#fff" : "rgba(255,255,255,0.6)",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                Beat {s.step}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage Card */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${current.color}40`,
          borderRadius: "8px",
          padding: "32px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-40px",
            right: "-40px",
            width: "160px",
            height: "160px",
            borderRadius: "50%",
            background: `${current.color}15`,
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "3px 8px",
              borderRadius: "4px",
              background: `${current.color}20`,
              color: current.color,
            }}
          >
            {current.tagline}
          </span>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
            Step {current.step} of 5
          </span>
        </div>

        <h3 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", margin: "0 0 14px", lineHeight: 1.3 }}>
          {current.title}
        </h3>

        <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)", margin: "0 0 20px", lineHeight: 1.6, maxWidth: "700px" }}>
          {current.description}
        </p>

        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "6px",
            padding: "12px 16px",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13px",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <Sparkles size={16} color={current.color} />
          <span>{current.example}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            type="button"
            onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
            disabled={activeStep === 0}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              color: activeStep === 0 ? "rgba(255,255,255,0.3)" : "#fff",
              padding: "6px 14px",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: activeStep === 0 ? "not-allowed" : "pointer",
            }}
          >
            ← Previous
          </button>

          <button
            type="button"
            onClick={() => setActiveStep((prev) => Math.min(STORY_STEPS.length - 1, prev + 1))}
            disabled={activeStep === STORY_STEPS.length - 1}
            style={{
              background: activeStep === STORY_STEPS.length - 1 ? "none" : current.color,
              border: "1px solid rgba(255,255,255,0.15)",
              color: activeStep === STORY_STEPS.length - 1 ? "rgba(255,255,255,0.3)" : "#000",
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: activeStep === STORY_STEPS.length - 1 ? "not-allowed" : "pointer",
            }}
          >
            {activeStep === STORY_STEPS.length - 1 ? "Completed" : "Next Beat →"}
          </button>
        </div>
      </div>

      {/* Collapsible "For Developers" Drawer */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.02)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setDevDrawerOpen((prev) => !prev)}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "none",
            border: "none",
            color: "#fff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Code2 size={16} color="#c7ff4a" />
            <span>For Developers: Program IDs & Architecture Specs</span>
          </div>
          {devDrawerOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {devDrawerOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: "14px 0 0", lineHeight: 1.5 }}>
              Moxie separates event ingestion, probability pricing, and solvency proofs across distinct Solana programs. Below are the verified program IDs deployed on Solana Devnet:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "11px", color: "#c7ff4a", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Percolator Engine
                </span>
                <code style={{ fontSize: "11px", wordBreak: "break-all", color: "rgba(255,255,255,0.85)" }}>
                  {DEVNET_DEPLOYMENT.percolatorProgramId}
                </code>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>
                  v16 solvency clearing slab
                </small>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "11px", color: "#60a5fa", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Moxie Matcher
                </span>
                <code style={{ fontSize: "11px", wordBreak: "break-all", color: "rgba(255,255,255,0.85)" }}>
                  {DEVNET_DEPLOYMENT.matcherProgramId}
                </code>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>
                  Atomic CPI counterparty matching
                </small>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "11px", color: "#a78bfa", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Moxie Oracle
                </span>
                <code style={{ fontSize: "11px", wordBreak: "break-all", color: "rgba(255,255,255,0.85)" }}>
                  {DEVNET_DEPLOYMENT.oracleProgramId}
                </code>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>
                  Guarded mark & lifecycle state machine
                </small>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Collateral Mint (USDC)
                </span>
                <code style={{ fontSize: "11px", wordBreak: "break-all", color: "rgba(255,255,255,0.85)" }}>
                  {DEVNET_DEPLOYMENT.usdcMint}
                </code>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>
                  SPL Token 6 decimals
                </small>
              </div>
            </div>

            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5, background: "rgba(255,255,255,0.02)", padding: "10px 14px", borderRadius: "4px" }}>
              <strong>Solvency Envelope Guarantee:</strong> Initial Margin is strictly 10,000 bps (100% collateralized, 1× leverage), guaranteeing exact solvency proofs under Percolator v16 rules where <code>max_price_move_bps_per_slot × max_accrual_dt_slots ≤ 10,000</code>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
