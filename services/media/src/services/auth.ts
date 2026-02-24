import { jwtVerify, importSPKI } from "jose";
import { UnauthorizedError } from "./errors.js";

export interface Claims {
  sub: string;
  accountId: string;
  role: string;
}

/**
 * Validate a Bearer JWT from an Authorization header.
 * Returns decoded claims or throws UnauthorizedError.
 */
export async function verifyToken(authHeader: string | undefined, publicKeyPem: string): Promise<Claims> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);
  try {
    const key = await importSPKI(publicKeyPem, "RS256");
    const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"] });
    const accountId = payload["accountId"] as string | undefined;
    const sub = payload.sub as string | undefined;
    const role = (payload["role"] as string | undefined) ?? "member";
    if (!accountId || !sub) throw new UnauthorizedError("Token missing required claims");
    return { sub, accountId, role };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid token");
  }
}
