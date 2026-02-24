import type { RouteHandler } from "./types.js";
import { ok, err } from "./types.js";
import { NotFoundError } from "../services/errors.js";

/**
 * GET /media/uploads/:id
 * Returns the upload record plus error and ref counts.
 */
export const getUploadHandler: RouteHandler = async (event, ctx) => {
  const uploadId = event.pathParameters?.["id"];
  if (!uploadId) return err(400, "BAD_REQUEST", "Missing upload id");

  try {
    const upload = await ctx.uploads.getById(uploadId, ctx.claims.accountId);
    const [errors, refs] = await Promise.all([
      ctx.uploads.getErrors(uploadId),
      ctx.uploads.getRefs(uploadId),
    ]);
    return ok({ ...upload, errorCount: errors.length, refCount: refs.length, errors, refs });
  } catch (e) {
    if (e instanceof NotFoundError) return err(404, "NOT_FOUND", (e as Error).message);
    throw e;
  }
};
