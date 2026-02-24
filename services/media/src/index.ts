import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { S3Service } from "./services/s3.js";
import { UploadsService } from "./services/uploads.service.js";
import { ExportsService } from "./services/exports.service.js";
import { verifyToken } from "./services/auth.js";
import { UnauthorizedError } from "./services/errors.js";
import type { HandlerContext } from "./handlers/types.js";
import { err } from "./handlers/types.js";
import { presignHandler } from "./handlers/presign.handler.js";
import { processHandler } from "./handlers/process.handler.js";
import { getUploadHandler } from "./handlers/get-upload.handler.js";
import { createExportHandler } from "./handlers/create-export.handler.js";
import { getExportHandler } from "./handlers/get-export.handler.js";
import type { ContactImporter } from "./services/csv-processor.js";
import { matchRoute } from "./router.js";

// Lazy-init singletons (reused across Lambda warm invocations)
let db: ReturnType<typeof createDb> | null = null;
let s3Service: S3Service | null = null;
let initialized = false;

async function ensureInit(): Promise<{ db: ReturnType<typeof createDb>; s3: S3Service }> {
  if (!initialized) {
    const dbInstance = createDb(mustEnv("DATABASE_URL"));
    await runMigrations(dbInstance);
    db = dbInstance;
    s3Service = new S3Service({
      bucket: mustEnv("S3_BUCKET"),
      region: process.env["AWS_REGION"] ?? "us-east-1",
    });
    initialized = true;
  }
  return { db: db!, s3: s3Service! };
}

// Stub importer — replaced with real HTTP call in production
const STUB_IMPORTER: ContactImporter = {
  async upsert(_p) { return { id: "stub", created: false }; },
};

function mustEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const route = matchRoute(event.httpMethod, event.path);
    if (!route) {
      return err(404, "NOT_FOUND", `No route: ${event.httpMethod} ${event.path}`);
    }

    if (route === "health") {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", service: "media" }) };
    }

    // Authenticate
    const jwtPublicKey = process.env["JWT_PUBLIC_KEY"] ?? "";
    let claims;
    try {
      claims = await verifyToken(event.headers["Authorization"] ?? event.headers["authorization"], jwtPublicKey);
    } catch (e) {
      if (e instanceof UnauthorizedError) return err(401, "UNAUTHORIZED", (e as Error).message);
      return err(401, "UNAUTHORIZED", "Authentication failed");
    }

    const { db: dbInstance, s3 } = await ensureInit();
    const ctx: HandlerContext = {
      db: dbInstance,
      s3,
      uploads: new UploadsService(dbInstance),
      exports: new ExportsService(dbInstance),
      contactImporter: STUB_IMPORTER,
      claims,
      s3Bucket: process.env["S3_BUCKET"] ?? "",
    };

    switch (route) {
      case "presign": return presignHandler(event, ctx);
      case "process": return processHandler(event, ctx);
      case "get-upload": return getUploadHandler(event, ctx);
      case "create-export": return createExportHandler(event, ctx);
      case "get-export": return getExportHandler(event, ctx);
      default: return err(404, "NOT_FOUND", "Unknown route");
    }
  } catch (e) {
    console.error("Unhandled error:", e);
    return err(500, "INTERNAL_ERROR", "Internal server error");
  }
};
