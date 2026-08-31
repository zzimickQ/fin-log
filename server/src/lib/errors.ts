/**
 * Domain errors with an HTTP status code, handled centrally in app.ts so
 * usecases can throw instead of building reply objects by hand.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, message, details);
}
export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, message);
}
export function forbidden(message: string): ApiError {
  return new ApiError(403, message);
}
export function notFound(message: string): ApiError {
  return new ApiError(404, message);
}
export function conflict(message: string): ApiError {
  return new ApiError(409, message);
}
