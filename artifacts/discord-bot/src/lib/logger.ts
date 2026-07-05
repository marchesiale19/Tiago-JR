import pino, { type Logger } from "pino";

export const logger: Logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  transport:
    process.env["NODE_ENV"] === "production"
      ? undefined
      : { target: "pino-pretty" },
});
