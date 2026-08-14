import pino from "pino";

const logger = pino({
  base: { service: "lemonvision-promo-app" },
  timestamp: pino.stdTimeFunctions.isoTime,
  level: process.env.LOG_LEVEL ?? "info",
});

export default logger;
