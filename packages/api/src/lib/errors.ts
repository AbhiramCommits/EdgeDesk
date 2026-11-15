/**
 * Single error type for API failures. The Hono error handler turns it into a
 * stable JSON envelope: { error: { code, message, details? } }.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "validation_error", message, details);
  }

  static unauthorized(message = "Sign in required"): ApiError {
    return new ApiError(401, "unauthorized", message);
  }

  static forbidden(message = "You do not have permission to perform this action"): ApiError {
    return new ApiError(403, "forbidden", message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, "not_found", message);
  }

  static conflict(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(409, code, message, details);
  }
}
