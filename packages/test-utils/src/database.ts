import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";

let container: StartedPostgreSqlContainer | null = null;
let connectionString: string | null = null;

/**
 * Starts a PostgreSQL Testcontainer for integration tests.
 * Call once in beforeAll(), tear down in afterAll().
 */
export async function startTestDatabase(): Promise<string> {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("electragram_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  connectionString = container.getConnectionUri();
  return connectionString;
}

export async function stopTestDatabase(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
    connectionString = null;
  }
}

export function getTestDatabaseUrl(): string {
  if (!connectionString) {
    throw new Error("Test database not started. Call startTestDatabase() first.");
  }
  return connectionString;
}

/**
 * Wraps a test in a transaction that is rolled back after the test completes,
 * providing clean state isolation without needing to truncate tables.
 */
export function withTransaction(
  getClient: () => import("pg").PoolClient,
  fn: (client: import("pg").PoolClient) => Promise<void>
): () => Promise<void> {
  return async () => {
    const client = getClient();
    await client.query("BEGIN");
    try {
      await fn(client);
    } finally {
      await client.query("ROLLBACK");
    }
  };
}
