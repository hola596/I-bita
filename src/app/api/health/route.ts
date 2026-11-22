import { NextResponse } from "next/server";
import { Client } from "pg";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Health check ligero para Vercel / monitores externos:
 * verifica conectividad real contra PostgreSQL sin filtrar credenciales.
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  const pg = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await pg.connect();
    await pg.query("SELECT 1");

    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        database: "connected",
        environment: process.env.NODE_ENV ?? "unknown",
        timestamp,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        database: "error",
        timestamp,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } finally {
    await pg.end().catch(() => undefined);
  }
}
