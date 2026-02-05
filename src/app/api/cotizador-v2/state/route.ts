import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_ID = "cotizador-v2";

let pool: any = null;
// Use require to avoid TypeScript type resolution issues in Vercel builds
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Pool } = require("pg");

function getConnectionString() {
  return (
    process.env.DB_DATABASE_URL ||
    process.env.DB_DATABASE_URL_UNPOOLED ||
    process.env.DB_POSTGRES_URL ||
    process.env.DB_POSTGRES_URL_NON_POOLING ||
    process.env.DB_POSTGRES_URL_NO_SSL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.NEON_DATABASE_URL ||
    process.env.NEON_URL ||
    process.env.NEON_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.PG_CONNECTION_STRING ||
    ""
  );
}

function getPool() {
  if (pool) return pool;
  const connectionString = getConnectionString();
  if (!connectionString) return null;
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

async function ensureTable(client: { query: (sql: string, params?: any[]) => Promise<any> }) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS cotizador_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`
  );
}

export async function GET() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  }
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query("SELECT data FROM cotizador_state WHERE id = $1 LIMIT 1", [STATE_ID]);
    const data = result.rows?.[0]?.data ?? null;
    if (!data) return NextResponse.json({ projects: [], currentId: null });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "db error" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(req: Request) {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  }
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.projects)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const payload = {
    projects: body.projects,
    currentId: body.currentId ?? null,
  };

  const client = await pool.connect();
  try {
    await ensureTable(client);
    await client.query(
      `INSERT INTO cotizador_state (id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [STATE_ID, payload]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "db error" }, { status: 500 });
  } finally {
    client.release();
  }
}
