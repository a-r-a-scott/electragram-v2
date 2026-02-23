/**
 * Generic test app builder type.
 * Each service exports a `buildApp(config)` function — this utility wraps it
 * for tests, injecting test database/redis/AWS config automatically.
 */
export interface TestAppConfig {
  databaseUrl: string;
  redisUrl?: string;
  awsEndpoint?: string;
  jwtPublicKey?: string;
}

export interface TestApp {
  /** Base URL to make HTTP requests against */
  baseUrl: string;
  /** Tear down the app after tests */
  close: () => Promise<void>;
}
