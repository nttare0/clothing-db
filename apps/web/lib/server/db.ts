import postgres from "postgres";

// Lazily created on first use so `next build` (which imports route modules)
// never requires DATABASE_URL at build time.
const connectionString = process.env.DATABASE_URL;

type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;

function getClient(): Sql {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!client) {
    // Supabase pooler (transaction mode) note: prepared statements must be disabled.
    // `max` stays low — each serverless invocation opens at most this many connections.
    // Local development/testing against a plain postgres (sslmode=disable) opts out;
    // hosted databases (Supabase pooler) keep require by default.
    const sslDisabled = /[?&]sslmode=disable(&|$)/.test(connectionString);
    client = postgres(connectionString, {
      ssl: sslDisabled ? false : "require",
      prepare: false,
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sql: Sql = new Proxy((() => {}) as any, {
  get(_target, prop, _receiver) {
    const instance = getClient() as any;
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
  apply(_target, _thisArg, args) {
    return (getClient() as any)(...args);
  },
});
