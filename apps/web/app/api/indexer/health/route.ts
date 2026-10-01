import { NextResponse } from "next/server";
import { getIndexerUrl } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET() {
  const indexerBase = getIndexerUrl();
  if (!indexerBase) {
    return NextResponse.json({ ok: false, error: "No indexer URL configured" }, { status: 503 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${indexerBase}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      {
        ...data,
        proxyOk: res.ok,
        status: res.status,
        indexerHost: new URL(indexerBase).host,
      },
      { status: res.status }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Failed to reach indexer /health",
        indexerHost: indexerBase,
      },
      { status: 504 }
    );
  }
}
