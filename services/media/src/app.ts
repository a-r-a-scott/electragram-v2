/**
 * Thin test helper — lets unit tests call the Lambda handler directly
 * without needing a real DB or S3 connection.
 */
export { handler } from "./index.js";
export { matchRoute } from "./router.js";
