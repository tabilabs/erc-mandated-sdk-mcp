export class ErcMandatedSdkError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, params: { code: string; name?: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = params.name ?? "ErcMandatedSdkError";
    this.code = params.code;
    this.details = params.details;
  }
}
