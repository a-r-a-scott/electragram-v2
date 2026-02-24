import type { RouteHandler } from "./types.js";
import { ok, err } from "./types.js";
import { processCsvUpload } from "../services/csv-processor.js";
import { NotFoundError } from "../services/errors.js";

/**
 * POST /media/uploads/:id/process
 * Downloads the file from S3, processes it (CSV import), and updates upload status.
 */
export const processHandler: RouteHandler = async (event, ctx) => {
  const uploadId = event.pathParameters?.["id"];
  if (!uploadId) return err(400, "BAD_REQUEST", "Missing upload id");

  let upload;
  try {
    upload = await ctx.uploads.getById(uploadId, ctx.claims.accountId);
  } catch (e) {
    if (e instanceof NotFoundError) return err(404, "NOT_FOUND", (e as Error).message);
    throw e;
  }

  if (upload.status === "processing" || upload.status === "processed") {
    return err(409, "CONFLICT", `Upload is already ${upload.status}`);
  }

  const s3Key = (upload.details as Record<string, unknown>)?.["s3Key"] as string | undefined;
  if (!s3Key) return err(500, "INTERNAL", "Upload has no S3 key");

  const mapping = upload.mapping ?? {};
  if (Object.keys(mapping).length === 0) {
    return err(422, "VALIDATION_ERROR", "Upload has no column mapping — set mapping before processing");
  }

  await ctx.uploads.setStatus(uploadId, "processing");

  let csvBuffer: Buffer;
  try {
    csvBuffer = await ctx.s3.getObject(s3Key);
  } catch {
    await ctx.uploads.setStatus(uploadId, "failed");
    return err(500, "S3_ERROR", "Failed to fetch file from S3");
  }

  try {
    const result = await processCsvUpload({
      uploadId,
      accountId: ctx.claims.accountId,
      csvBuffer,
      mapping,
      uploadsService: ctx.uploads,
      contactImporter: ctx.contactImporter,
    });

    await ctx.uploads.setStatus(uploadId, "processed");
    return ok({ uploadId, ...result });
  } catch {
    await ctx.uploads.setStatus(uploadId, "failed");
    return err(500, "PROCESSING_ERROR", "CSV processing failed");
  }
};
