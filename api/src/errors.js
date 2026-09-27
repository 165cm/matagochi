export class ApiError extends Error {
  constructor(status, code, message, detail = "") {
    super(message);
    this.detail = detail;
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(error) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "internal_error";
  const message = error instanceof ApiError ? error.message : "処理中にエラーが発生しました。";
  const detail = error instanceof ApiError && error.detail ? { detail: String(error.detail).slice(0, 400) } : {};
  return { status, body: { error: { code, message, ...detail } } };
}
