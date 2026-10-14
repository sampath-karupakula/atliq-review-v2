import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// postgres.js works against both the local container and Neon's pooled URL.
// `prepare: false` is required behind Neon's PgBouncer pooler.
// Cached on globalThis so Next.js dev hot-reloads don't open new pools.
const cache = globalThis as unknown as { atliqSql?: postgres.Sql; atliqDb?: Db };

export function getSql(): postgres.Sql {
  if (!cache.atliqSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cache.atliqSql = postgres(url, { prepare: false, max: 5 });
  }
  return cache.atliqSql;
}

export function getDb(): Db {
  if (!cache.atliqDb) cache.atliqDb = drizzle({ client: getSql(), schema });
  return cache.atliqDb;
}
