import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Client } from "pg";
import { env } from "@/env";

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
  const apiKeyHeader = request.headers.get("x-api-key") ?? "";

  if (env.CRON_SECRET && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (constantTimeMatch(token, env.CRON_SECRET)) {
      return true;
    }
  }

  if (env.BIOMETRIC_API_KEY && apiKeyHeader.trim()) {
    if (constantTimeMatch(apiKeyHeader.trim(), env.BIOMETRIC_API_KEY)) {
      return true;
    }
  }

  return false;
}

async function handleCleanup(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cleanup request." },
      { status: 401 }
    );
  }

  const pgClient = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await pgClient.connect();
  try {
    const res = await pgClient.query<{
      purged_rows: number;
      deleted_objects: number;
    }>(`SELECT purged_rows, deleted_objects FROM public.purge_expired_kyc_evidence()`);

    const row = res.rows[0];
    return NextResponse.json({
      ok: true,
      purgedRows: Number(row?.purged_rows ?? 0),
      deletedObjects: Number(row?.deleted_objects ?? 0),
      executedAt: new Date().toISOString(),
    });
  } finally {
    await pgClient.end();
  }
}

export async function GET(request: Request) {
  return handleCleanup(request);
}

export async function POST(request: Request) {
  return handleCleanup(request);
}
