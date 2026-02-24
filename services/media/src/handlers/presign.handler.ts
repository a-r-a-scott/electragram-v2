import { nanoid } from "nanoid";
import type { RouteHandler } from "./types.js";
import { ok, err } from "./types.js";

interface PresignBody {
  filename: string;
  contentType: string;
  purpose?: string;
  mapping?: Record<string, string>;
  relateableId?: string;
  relateableType?: string;
}

/**
 * POST /media/uploads/presign
 * Creates an upload record and returns a presigned S3 PUT URL.
 * The client uploads the file directly to S3, then calls /process.
 */
export const presignHandler: RouteHandler = async (event, ctx) => {
  let body: PresignBody;
  try {
    body = JSON.parse(event.body ?? "{}") as PresignBody;
  } catch {
    return err(400, "BAD_REQUEST", "Invalid JSON body");
  }

  if (!body.filename || !body.contentType) {
    return err(422, "VALIDATION_ERROR", "filename and contentType are required");
  }

  const s3Key = `uploads/${ctx.claims.accountId}/${nanoid()}/${body.filename}`;

  const upload = await ctx.uploads.create({
    accountId: ctx.claims.accountId,
    userId: ctx.claims.sub,
    purpose: body.purpose,
    relateableId: body.relateableId,
    relateableType: body.relateableType,
    mapping: body.mapping,
    details: { s3Key, filename: body.filename, contentType: body.contentType },
  });

  const presignedUrl = await ctx.s3.presignUpload(s3Key, body.contentType);

  return ok({ upload, presignedUrl }, 201);
};
