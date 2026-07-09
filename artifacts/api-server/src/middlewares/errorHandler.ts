import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { UnsupportedFileTypeError } from "../lib/documentExtraction";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      message: "Некорректные данные запроса",
      details: err.issues,
    });
    return;
  }

  if (err instanceof UnsupportedFileTypeError) {
    res.status(422).json({ error: "unsupported_file_type", message: err.message });
    return;
  }

  logger.error({ err }, "Unhandled error in request");
  res.status(500).json({
    error: "internal_error",
    message: err instanceof Error ? err.message : "Внутренняя ошибка сервера",
  });
};
