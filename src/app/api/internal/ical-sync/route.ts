import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { syncAllRegisteredIcalFeedsServerAction } from "@/modules/ical/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function constantTimeMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAuthorizedCronRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization") ?? "";
  if (env.CRON_SECRET && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (constantTimeMatch(token, env.CRON_SECRET)) {
      return true;
    }
  }
  return false;
}

async function handleIcalCronSync(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized iCal sync request." },
      { status: 401 }
    );
  }

  try {
    const summary = await syncAllRegisteredIcalFeedsServerAction();
    return NextResponse.json({
      ok: true,
      ...summary,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Error inesperado ejecutando sincronización global iCal.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleIcalCronSync(request);
}

export async function POST(request: Request) {
  return handleIcalCronSync(request);
}
