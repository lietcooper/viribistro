// Domain error class — thrown from routes/services with a known HTTP status.
// The global error middleware in `middleware/errorHandler.ts` recognizes
// AppError instances and renders them as `{ error: { code, message } }`.
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
