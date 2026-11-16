import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function runMigration() {
  loadEnvLocal();
  const { env } = await import("../src/env");

  const sqlPath = path.resolve(
    process.cwd(),
    "supabase/migrations/0001_initial_schema_and_rls.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  console.log("[MIGRATE] Connecting to Supabase PostgreSQL...");
  await client.connect();

  try {
    await client.query(sql);
    const tablesRes = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.log("[MIGRATE] Migration 0001 applied successfully. Public tables & RLS:");
    for (const row of tablesRes.rows) {
      console.log(`  - public.${row.tablename} (RLS: ${row.rowsecurity})`);
    }
  } finally {
    await client.end();
  }
}

runMigration().catch((err) => {
  console.error("[MIGRATE] Fatal error:", err);
  process.exit(1);
});
