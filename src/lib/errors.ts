export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 503, "NOT_CONFIGURED");
    this.name = "ConfigurationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please slow down.") {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  return { status: 500, body: { error: message, code: "INTERNAL_ERROR" } };
}
