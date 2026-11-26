import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Supabase pooler (transaction mode) note: prepared statements must be disabled.
// max is kept low — each serverless invocation opens at most this many connections.
export const sql = postgres(connectionString, {
  ssl: "require",
  prepare: false,
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
});
