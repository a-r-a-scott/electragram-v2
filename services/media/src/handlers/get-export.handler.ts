import type { RouteHandler } from "./types.js";
import { ok, err } from "./types.js";
import { NotFoundError } from "../services/errors.js";

/**
 * GET /media/exports/:id
 * Returns the export record. If completed, includes a fresh presigned download URL.
 */
export const getExportHandler: RouteHandler = async (event, ctx) => {
  const exportId = event.pathParameters?.["id"];
  if (!exportId) return err(400, "BAD_REQUEST", "Missing export id");

  try {
    const exportRecord = await ctx.exports.getById(exportId, ctx.claims.accountId);

    let downloadUrl: string | undefined;
    if (exportRecord.status === "completed") {
      const s3Key = (exportRecord.details as Record<string, unknown>)?.["s3Key"] as string | undefined;
      if (s3Key) {
        downloadUrl = await ctx.s3.presignDownload(s3Key);
      }
    }

    return ok({ ...exportRecord, downloadUrl });
  } catch (e) {
    if (e instanceof NotFoundError) return err(404, "NOT_FOUND", (e as Error).message);
    throw e;
  }
};
