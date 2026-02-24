import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import type { Db } from "../db/client.js";
import type { S3Service } from "../services/s3.js";
import type { UploadsService } from "../services/uploads.service.js";
import type { ExportsService } from "../services/exports.service.js";
import type { ContactImporter } from "../services/csv-processor.js";
import type { Claims } from "../services/auth.js";

export type { APIGatewayProxyEvent, APIGatewayProxyResult };

export interface HandlerContext {
  db: Db;
  s3: S3Service;
  uploads: UploadsService;
  exports: ExportsService;
  contactImporter: ContactImporter;
  claims: Claims;
  s3Bucket: string;
}

export type RouteHandler = (
  event: APIGatewayProxyEvent,
  ctx: HandlerContext,
) => Promise<APIGatewayProxyResult>;

export function ok(body: unknown, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, data: body }),
  };
}

export function err(statusCode: number, code: string, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, error: { code, message } }),
  };
}
