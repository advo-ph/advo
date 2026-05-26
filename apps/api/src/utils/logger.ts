import pino from "pino";

export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  serializers: {
    err: pino.stdSerializers.err,
    req(req) {
      return {
        method: req.method,
        url: req.url,
        id: req.id,
      };
    },
  },
});

export function createLogger(prefix: string) {
  return logger.child({ module: prefix });
}
