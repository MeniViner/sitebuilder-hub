import { Response } from "express";

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, data, ...(meta ? { meta } : {}) });
}

export function fail(
  res: Response,
  code: string,
  message: string,
  details?: unknown,
  statusCode = 400
) {
  return res.status(statusCode).json({
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  });
}
