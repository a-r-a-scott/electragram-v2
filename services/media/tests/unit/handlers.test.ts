import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { presignHandler } from "../../src/handlers/presign.handler.js";
import { processHandler } from "../../src/handlers/process.handler.js";
import { getUploadHandler } from "../../src/handlers/get-upload.handler.js";
import { createExportHandler } from "../../src/handlers/create-export.handler.js";
import { getExportHandler } from "../../src/handlers/get-export.handler.js";
import type { HandlerContext } from "../../src/handlers/types.js";
import type { UploadsService } from "../../src/services/uploads.service.js";
import type { ExportsService } from "../../src/services/exports.service.js";
import type { S3Service } from "../../src/services/s3.js";

const FAKE_CLAIMS = { sub: "usr_1", accountId: "acc_1", role: "admin" };

const FAKE_UPLOAD = {
  id: "upl_1", accountId: "acc_1", userId: "usr_1", status: "pending",
  purpose: "contacts", mapping: { email: "Email" },
  details: { s3Key: "uploads/acc_1/upl_1/test.csv", filename: "test.csv" },
  analyzedAt: null, processedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

const FAKE_EXPORT = {
  id: "exp_1", accountId: "acc_1", userId: "usr_1", status: "completed",
  exportType: "contacts", label: "Test Export",
  details: { s3Key: "exports/acc_1/exp_1.csv" },
  exportedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};

function makeContext(overrides?: Partial<HandlerContext>): HandlerContext {
  const uploads = {
    create: vi.fn().mockResolvedValue(FAKE_UPLOAD),
    getById: vi.fn().mockResolvedValue(FAKE_UPLOAD),
    setStatus: vi.fn().mockResolvedValue(undefined),
    recordError: vi.fn().mockResolvedValue(undefined),
    recordRef: vi.fn().mockResolvedValue(undefined),
    getErrors: vi.fn().mockResolvedValue([]),
    getRefs: vi.fn().mockResolvedValue([]),
  } as unknown as UploadsService;

  const exports = {
    create: vi.fn().mockResolvedValue(FAKE_EXPORT),
    getById: vi.fn().mockResolvedValue(FAKE_EXPORT),
    setProcessing: vi.fn().mockResolvedValue(undefined),
    setCompleted: vi.fn().mockResolvedValue(undefined),
    setFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExportsService;

  const s3 = {
    presignUpload: vi.fn().mockResolvedValue("https://s3.example.com/presigned-put"),
    presignDownload: vi.fn().mockResolvedValue("https://s3.example.com/presigned-get"),
    getObject: vi.fn().mockResolvedValue(Buffer.from('Email,First Name\nalice@example.com,Alice', "utf8")),
    putObject: vi.fn().mockResolvedValue(undefined),
  } as unknown as S3Service;

  return {
    db: {} as never,
    s3,
    uploads,
    exports,
    contactImporter: { upsert: vi.fn().mockResolvedValue({ id: "c1", created: true }) },
    claims: FAKE_CLAIMS,
    s3Bucket: "test-bucket",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: "GET",
    path: "/health",
    headers: {},
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    requestContext: {} as never,
    resource: "",
    stageVariables: null,
    ...overrides,
  };
}

describe("presignHandler", () => {
  it("returns 201 with presigned URL and upload record", async () => {
    const ctx = makeContext();
    const res = await presignHandler(
      makeEvent({ httpMethod: "POST", path: "/media/uploads/presign", body: JSON.stringify({ filename: "contacts.csv", contentType: "text/csv", purpose: "contacts", mapping: { email: "Email" } }) }),
      ctx,
    );
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { success: boolean; data: { presignedUrl: string } };
    expect(body.success).toBe(true);
    expect(body.data.presignedUrl).toContain("presigned-put");
  });

  it("returns 422 when filename is missing", async () => {
    const ctx = makeContext();
    const res = await presignHandler(makeEvent({ httpMethod: "POST", body: JSON.stringify({ contentType: "text/csv" }) }), ctx);
    expect(res.statusCode).toBe(422);
  });

  it("returns 400 on invalid JSON", async () => {
    const ctx = makeContext();
    const res = await presignHandler(makeEvent({ body: "not-json" }), ctx);
    expect(res.statusCode).toBe(400);
  });
});

describe("getUploadHandler", () => {
  it("returns the upload with error and ref counts", async () => {
    const ctx = makeContext();
    const res = await getUploadHandler(makeEvent({ pathParameters: { id: "upl_1" } }), ctx);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { id: string; errorCount: number } };
    expect(body.data.id).toBe("upl_1");
    expect(body.data.errorCount).toBe(0);
  });

  it("returns 404 when upload not found", async () => {
    const { NotFoundError } = await import("../../src/services/errors.js");
    const ctx = makeContext();
    (ctx.uploads.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new NotFoundError("Not found"));
    const res = await getUploadHandler(makeEvent({ pathParameters: { id: "missing" } }), ctx);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when id is missing from path", async () => {
    const ctx = makeContext();
    const res = await getUploadHandler(makeEvent({ pathParameters: null }), ctx);
    expect(res.statusCode).toBe(400);
  });
});

describe("processHandler", () => {
  it("processes a pending upload and returns result", async () => {
    const ctx = makeContext();
    const res = await processHandler(makeEvent({ pathParameters: { id: "upl_1" } }), ctx);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { uploadId: string; imported: number } };
    expect(body.data.uploadId).toBe("upl_1");
  });

  it("returns 409 if upload is already processed", async () => {
    const ctx = makeContext();
    (ctx.uploads.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...FAKE_UPLOAD, status: "processed" });
    const res = await processHandler(makeEvent({ pathParameters: { id: "upl_1" } }), ctx);
    expect(res.statusCode).toBe(409);
  });

  it("returns 422 if upload has no mapping", async () => {
    const ctx = makeContext();
    (ctx.uploads.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...FAKE_UPLOAD, mapping: {} });
    const res = await processHandler(makeEvent({ pathParameters: { id: "upl_1" } }), ctx);
    expect(res.statusCode).toBe(422);
  });
});

describe("createExportHandler", () => {
  it("creates an export and returns 201", async () => {
    const ctx = makeContext();
    const res = await createExportHandler(
      makeEvent({ httpMethod: "POST", body: JSON.stringify({ exportType: "contacts", label: "My Export" }) }),
      ctx,
    );
    expect(res.statusCode).toBe(201);
  });

  it("returns 422 for missing exportType", async () => {
    const ctx = makeContext();
    const res = await createExportHandler(makeEvent({ body: "{}" }), ctx);
    expect(res.statusCode).toBe(422);
  });

  it("returns 422 for invalid exportType", async () => {
    const ctx = makeContext();
    const res = await createExportHandler(makeEvent({ body: JSON.stringify({ exportType: "invalid_type" }) }), ctx);
    expect(res.statusCode).toBe(422);
  });
});

describe("getExportHandler", () => {
  it("returns export with download URL when completed", async () => {
    const ctx = makeContext();
    const res = await getExportHandler(makeEvent({ pathParameters: { id: "exp_1" } }), ctx);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { downloadUrl: string } };
    expect(body.data.downloadUrl).toContain("presigned-get");
  });

  it("returns 404 when export not found", async () => {
    const { NotFoundError } = await import("../../src/services/errors.js");
    const ctx = makeContext();
    (ctx.exports.getById as ReturnType<typeof vi.fn>).mockRejectedValue(new NotFoundError("Not found"));
    const res = await getExportHandler(makeEvent({ pathParameters: { id: "missing" } }), ctx);
    expect(res.statusCode).toBe(404);
  });
});
