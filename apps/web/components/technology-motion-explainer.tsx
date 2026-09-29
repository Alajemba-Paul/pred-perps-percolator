"use client";

import { useState, useEffect } from "react";
import {
  Radio,
  DatabaseZap,
  Braces,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle,
  Copy,
  ExternalLink,
  Layers,
  Cpu,
  Server,
  Zap,
} from "lucide-react";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

type Stage = {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  program: "moxie-oracle" | "percolator-prog" | "moxie-matcher" | "indexer";
  programLabel: string;
  programAddress: string;
  description: string;
  technicalDetails: string[];
  packet: string;
};

const stages: Stage[] = [
  {
    id: 1,
    badge: "01 / INGESTION",
    title: "Jupiter Event Ingestion",
    subtitle: "Identity, rules & outcome tokens imported",
    program: "moxie-oracle",
    programLabel: "moxie-oracle",
    programAddress: DEVNET_DEPLOYMENT.oracleProgramId,
    description:
      "A Jupiter prediction market event (e.g. Polymarket Tennis/Crypto) is ingested with its title, rule manifest, YES/NO asset IDs, and deadline close time. The browser never touches Jupiter API directly.",
    technicalDetails: [
      "Event hash & rulesHash locked into oracle state",
      "YES & NO asset IDs mapped to binary outcome tokens",
      "Reference probability initialized from external liquidity depth",
    ],
    packet: "Event: Columbus Mees Rottgering vs Edward Winter -> AssetIndex: 1",
  },
  {
    id: 2,
    badge: "02 / ORACLE RECORD",
    title: "Moxie Oracle & PushAuthMark",
    subtitle: "Authenticated mark updates Percolator slab",
    program: "moxie-oracle",
    programLabel: "moxie-oracle",
    programAddress: DEVNET_DEPLOYMENT.oracleProgramId,
    description:
      "The Moxie oracle PDA records bounded depth observations. It issues an authenticated CPI `PushAuthMark` into Percolator, updating AuthMark without trusting unverified taker quotes.",
    technicalDetails: [
      "Deterministic 384-byte Oracle Record PDA on Solana Devnet",
      "CPI PushAuthMark sets mark_e6 and observation_sequence",
      "Solvency guard prevents price manipulation beyond slot envelope",
    ],
    packet: "PushAuthMark { asset_index: 1, mark_e6: 958500, seq: 3 }",
  },
  {
    id: 3,
    badge: "03 / CLEARING",
    title: "Trader Signs Order on Percolator",
    subtitle: "Isolated 1× binary perp cleared on shared slab",
    program: "percolator-prog",
    programLabel: "percolator-prog & matcher",
    programAddress: DEVNET_DEPLOYMENT.percolatorProgramId,
    description:
      "The trader signs an authenticated Trade transaction against the deployed Percolator program. Atomic CPI matches against the LP counterparty (`moxie-matcher`) with 100% margin solvency checks.",
    technicalDetails: [
      "Percolator Instruction tag 10: TradeCpi with 1.4M compute units",
      "Exact solvency proof enforces 10,000 bps initial & maintenance margin",
      "Zero-sum position accounting between Trader & LP portfolio",
    ],
    packet: "TradeCpi { sizeQ: +1,000,000 (YES), feeBps: 30, limitPrice: 958500 }",
  },
  {
    id: 4,
    badge: "04 / PROJECTION",
    title: "Continuous Indexer Projection",
    subtitle: "Slot-by-slot account sync and REST endpoints",
    program: "indexer",
    programLabel: "moxie-indexer",
    programAddress: "services/indexer (PORT 8787)",
    description:
      "An independent indexer monitors validator slots, decodes 384-byte market records and 9563-byte portfolio accounts, and serves fast zero-cache REST endpoints `/v1/markets` and `/v1/portfolios`.",
    technicalDetails: [
      "Deterministic deserialization of binary SVM account layouts",
      "Tracks real-time position epochs, capital balances & mark PnL",
      "Serves Next.js frontend with sub-second health updates",
    ],
    packet: "GET /v1/markets/:id -> markE6, indexE6, status, positions",
  },
  {
    id: 5,
    badge: "05 / LIFECYCLE",
    title: "Deterministic Event Lifecycle",
    subtitle: "Active → Restricted → Hard-flat → Resolution",
    program: "moxie-oracle",
    programLabel: "percolator & oracle lifecycle",
    programAddress: DEVNET_DEPLOYMENT.oracleProgramId,
    description:
      "Unlike infinite perpetuals, prediction markets have a terminal expiry. Moxie automatically transitions from Active to ReduceOnly, executes lock-clock hard-flat before close, and resolves one-way to 0 or 1.",
    technicalDetails: [
      "Active (1) -> Restricted (2) -> ReduceOnly (3) -> Locked (4) -> Resolved (5)",
      "Automated keeper hard-flat clears open risk before provider lock",
      "One-way terminal outcome resolves binary perp to 100¢ (YES) or 0¢ (NO)",
    ],
    packet: "Lifecycle: Active -> ReduceOnly -> HardFlat -> Resolved(YES = 1)",
  },
];

export function TechnologyMotionExplainer() {
  const [activeStageId, setActiveStageId] = useState(1);
  const [hoveredProgram, setHoveredProgram] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Auto cycle stages
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStageId((prev) => (prev % stages.length) + 1);
    }, 6000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const activeStage = stages.find((s) => s.id === activeStageId) || stages[0];

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <div className="motion-explainer-root" style={{ width: "100%", margin: "24px 0" }}>
      {/* Top Pipeline Steps */}
      <div
        className="pipeline-stepper"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "8px",
          marginBottom: "24px",
        }}
      >
        {stages.map((stage) => {
          const isActive = stage.id === activeStageId;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => {
                setActiveStageId(stage.id);
                setIsPlaying(false);
              }}
              style={{
                background: isActive ? "rgba(199, 255, 74, 0.12)" : "rgba(255, 255, 255, 0.03)",
                border: isActive ? "1px solid #c7ff4a" : "1px solid rgba(255, 255, 255, 0.08)",
                padding: "12px 14px",
                borderRadius: "8px",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: isActive ? "#c7ff4a" : "rgba(255, 255, 255, 0.5)",
                  }}
                >
                  STEP 0{stage.id}
                </span>
                {isActive && (
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#c7ff4a",
                      boxShadow: "0 0 8px #c7ff4a",
                    }}
                  />
                )}
              </div>
              <strong
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: isActive ? "#fff" : "rgba(255, 255, 255, 0.8)",
                  lineHeight: "1.3",
                }}
              >
                {stage.title}
              </strong>
            </button>
          );
        })}
      </div>

      {/* Exploded Detail Card */}
      <div
        style={{
          background: "rgba(15, 19, 24, 0.85)",
          border: "1px solid rgba(199, 255, 74, 0.25)",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(12px)",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "24px",
        }}
      >
        {/* Left: Stage description & technical proof */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#c7ff4a",
                letterSpacing: "1px",
              }}
            >
              {activeStage.badge}
            </span>
            <span style={{ color: "rgba(255,255,255,0.3)" }}>•</span>
            <span style={{ fontSize: "12px", opacity: 0.7 }}>{activeStage.subtitle}</span>
          </div>

          <h3 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>
            {activeStage.title}
          </h3>

          <p style={{ fontSize: "14px", lineHeight: "1.6", color: "rgba(255, 255, 255, 0.8)", marginBottom: "20px" }}>
            {activeStage.description}
          </p>

          <div style={{ marginBottom: "20px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, opacity: 0.6, letterSpacing: "0.5px" }}>
              ON-CHAIN INVARIANTS & ENFORCEMENT:
            </span>
            <ul style={{ listStyle: "none", padding: 0, marginTop: "8px" }}>
              {activeStage.technicalDetails.map((detail, idx) => (
                <li
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    fontSize: "13px",
                    color: "rgba(255, 255, 255, 0.85)",
                    marginBottom: "6px",
                  }}
                >
                  <CheckCircle size={14} color="#c7ff4a" style={{ marginTop: "3px", flexShrink: 0 }} />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Wire Protocol Packet Preview */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "10px 14px",
              borderRadius: "6px",
              fontFamily: "monospace",
              fontSize: "12px",
              color: "#c7ff4a",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Zap size={14} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeStage.packet}
            </span>
          </div>
        </div>

        {/* Right: Interactive Program Matrix */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "8px",
            padding: "18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, opacity: 0.6, letterSpacing: "1px" }}>
                EXECUTING PROGRAM NODE
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "#c7ff4a",
                  background: "rgba(199, 255, 74, 0.1)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                Solana Devnet
              </span>
            </div>

            {/* Program Card 1: Percolator */}
            <div
              onMouseEnter={() => setHoveredProgram("percolator")}
              onMouseLeave={() => setHoveredProgram(null)}
              style={{
                background:
                  activeStage.program === "percolator-prog" || hoveredProgram === "percolator"
                    ? "rgba(199, 255, 74, 0.12)"
                    : "rgba(255, 255, 255, 0.02)",
                border:
                  activeStage.program === "percolator-prog" || hoveredProgram === "percolator"
                    ? "1px solid #c7ff4a"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                padding: "10px 12px",
                borderRadius: "6px",
                marginBottom: "8px",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldCheck size={14} color="#c7ff4a" /> percolator-prog (v16)
                </strong>
                <button
                  type="button"
                  onClick={() => handleCopy(DEVNET_DEPLOYMENT.percolatorProgramId)}
                  title="Copy Program ID"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
                >
                  <Copy size={12} />
                </button>
              </div>
              <code style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px", display: "block" }}>
                {DEVNET_DEPLOYMENT.percolatorProgramId}
              </code>
            </div>

            {/* Program Card 2: Moxie Oracle */}
            <div
              onMouseEnter={() => setHoveredProgram("oracle")}
              onMouseLeave={() => setHoveredProgram(null)}
              style={{
                background:
                  activeStage.program === "moxie-oracle" || hoveredProgram === "oracle"
                    ? "rgba(199, 255, 74, 0.12)"
                    : "rgba(255, 255, 255, 0.02)",
                border:
                  activeStage.program === "moxie-oracle" || hoveredProgram === "oracle"
                    ? "1px solid #c7ff4a"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                padding: "10px 12px",
                borderRadius: "6px",
                marginBottom: "8px",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <DatabaseZap size={14} color="#c7ff4a" /> moxie-oracle
                </strong>
                <button
                  type="button"
                  onClick={() => handleCopy(DEVNET_DEPLOYMENT.oracleProgramId)}
                  title="Copy Program ID"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
                >
                  <Copy size={12} />
                </button>
              </div>
              <code style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px", display: "block" }}>
                {DEVNET_DEPLOYMENT.oracleProgramId}
              </code>
            </div>

            {/* Program Card 3: Moxie Matcher */}
            <div
              onMouseEnter={() => setHoveredProgram("matcher")}
              onMouseLeave={() => setHoveredProgram(null)}
              style={{
                background:
                  activeStage.program === "moxie-matcher" || hoveredProgram === "matcher"
                    ? "rgba(199, 255, 74, 0.12)"
                    : "rgba(255, 255, 255, 0.02)",
                border:
                  activeStage.program === "moxie-matcher" || hoveredProgram === "matcher"
                    ? "1px solid #c7ff4a"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                padding: "10px 12px",
                borderRadius: "6px",
                marginBottom: "8px",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Cpu size={14} color="#c7ff4a" /> moxie-matcher (LP)
                </strong>
                <button
                  type="button"
                  onClick={() => handleCopy(DEVNET_DEPLOYMENT.matcherProgramId)}
                  title="Copy Program ID"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
                >
                  <Copy size={12} />
                </button>
              </div>
              <code style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px", display: "block" }}>
                {DEVNET_DEPLOYMENT.matcherProgramId}
              </code>
            </div>

            {/* Program Card 4: Moxie Indexer */}
            <div
              onMouseEnter={() => setHoveredProgram("indexer")}
              onMouseLeave={() => setHoveredProgram(null)}
              style={{
                background:
                  activeStage.program === "indexer" || hoveredProgram === "indexer"
                    ? "rgba(199, 255, 74, 0.12)"
                    : "rgba(255, 255, 255, 0.02)",
                border:
                  activeStage.program === "indexer" || hoveredProgram === "indexer"
                    ? "1px solid #c7ff4a"
                    : "1px solid rgba(255, 255, 255, 0.05)",
                padding: "10px 12px",
                borderRadius: "6px",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Server size={14} color="#c7ff4a" /> moxie-indexer service
                </strong>
              </div>
              <code style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "4px", display: "block" }}>
                GET /v1/markets • GET /v1/portfolios
              </code>
            </div>
          </div>

          {copiedAddress && (
            <div
              style={{
                fontSize: "11px",
                color: "#c7ff4a",
                textAlign: "center",
                marginTop: "10px",
                background: "rgba(199, 255, 74, 0.1)",
                padding: "4px",
                borderRadius: "4px",
              }}
            >
              Copied to clipboard!
            </div>
          )}

          {/* Stepper Controller */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "16px",
              paddingTop: "12px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                fontSize: "11px",
                background: "rgba(255,255,255,0.08)",
                border: "none",
                borderRadius: "4px",
                color: "#fff",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              {isPlaying ? "Pause Timeline" : "Auto-Play Timeline"}
            </button>
            <span style={{ fontSize: "11px", opacity: 0.6 }}>Stage {activeStageId} of 5</span>
          </div>
        </div>
      </div>
    </div>
  );
}
