export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(msg: string) {
    super(msg);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  readonly statusCode = 422;
  constructor(msg: string) {
    super(msg);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(msg: string) {
    super(msg);
    this.name = "UnauthorizedError";
  }
}
