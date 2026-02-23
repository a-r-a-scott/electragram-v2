import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

let pool: Pool | null = null;

export function createDb(databaseUrl: string) {
  pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
