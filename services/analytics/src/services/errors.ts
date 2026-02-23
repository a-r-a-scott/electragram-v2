export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) { super(message); this.name = "NotFoundError"; }
}
export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) { super(message); this.name = "ConflictError"; }
}
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string) { super(message); this.name = "ForbiddenError"; }
}
export class ValidationError extends Error {
  readonly statusCode = 422;
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message); this.name = "ValidationError";
  }
}
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message: string) { super(message); this.name = "UnauthorizedError"; }
}
