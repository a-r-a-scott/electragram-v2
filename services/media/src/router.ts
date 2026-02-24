/** Route matching logic — exported for unit testing */
export function matchRoute(method: string, path: string): string | null {
  const m = method.toUpperCase();
  const p = path.replace(/^\/api/, "");

  if (m === "GET" && p === "/health") return "health";
  if (m === "POST" && p === "/media/uploads/presign") return "presign";
  if (m === "POST" && /^\/media\/uploads\/[^/]+\/process$/.test(p)) return "process";
  if (m === "GET" && /^\/media\/uploads\/[^/]+$/.test(p)) return "get-upload";
  if (m === "POST" && p === "/media/exports") return "create-export";
  if (m === "GET" && /^\/media\/exports\/[^/]+$/.test(p)) return "get-export";
  return null;
}
