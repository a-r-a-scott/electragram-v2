import type { RouteHandler } from "./types.js";
import { ok, err } from "./types.js";

interface CreateExportBody {
  exportType: string;
  label?: string;
  recordType?: string;
  recordId?: string;
}

const ALLOWED_EXPORT_TYPES = ["contacts", "guests", "messages", "activities"] as const;

/**
 * POST /media/exports
 * Creates an export job and immediately runs it (inline for Lambda).
 * For large datasets this would be pushed to SQS for async processing.
 */
export const createExportHandler: RouteHandler = async (event, ctx) => {
  let body: CreateExportBody;
  try {
    body = JSON.parse(event.body ?? "{}") as CreateExportBody;
  } catch {
    return err(400, "BAD_REQUEST", "Invalid JSON body");
  }

  if (!body.exportType) return err(422, "VALIDATION_ERROR", "exportType is required");
  if (!ALLOWED_EXPORT_TYPES.includes(body.exportType as typeof ALLOWED_EXPORT_TYPES[number])) {
    return err(422, "VALIDATION_ERROR", `exportType must be one of: ${ALLOWED_EXPORT_TYPES.join(", ")}`);
  }

  const exportRecord = await ctx.exports.create({
    accountId: ctx.claims.accountId,
    userId: ctx.claims.sub,
    exportType: body.exportType,
    label: body.label,
    recordType: body.recordType,
    recordId: body.recordId,
  });

  // Mark as processing immediately — async export would be triggered via SQS
  await ctx.exports.setProcessing(exportRecord.id);

  // For the scaffold: generate a minimal CSV placeholder and upload to S3
  const csvContent = `id,export_type,account_id,generated_at\n${exportRecord.id},${body.exportType},${ctx.claims.accountId},${new Date().toISOString()}\n`;
  const s3Key = `exports/${ctx.claims.accountId}/${exportRecord.id}.csv`;

  try {
    await ctx.s3.putObject(s3Key, Buffer.from(csvContent, "utf8"), "text/csv");
    const downloadUrl = await ctx.s3.presignDownload(s3Key);

    await ctx.exports.setCompleted(exportRecord.id, { s3Key, downloadUrl });
    const completed = await ctx.exports.getById(exportRecord.id, ctx.claims.accountId);
    return ok(completed, 201);
  } catch {
    await ctx.exports.setFailed(exportRecord.id, "Export generation failed");
    return err(500, "EXPORT_FAILED", "Failed to generate export");
  }
};
