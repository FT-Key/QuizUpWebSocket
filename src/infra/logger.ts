import type { Logger, LogLevel } from "../core/application/ports/logger.js";

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly context: string;
}

type ConsoleMethod = (message: string, meta?: unknown) => void;

const WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger({ level, context }: LoggerOptions): Logger {
  const threshold = WEIGHT[level];
  const prefix = `[${context}]`;

  const write = (
    levelName: LogLevel,
    method: ConsoleMethod,
    message: string,
    meta?: unknown
  ): void => {
    if (WEIGHT[levelName] < threshold) return;
    if (meta === undefined) {
      method.call(console, `${prefix} ${message}`);
    } else {
      method.call(console, `${prefix} ${message}`, meta);
    }
  };

  return {
    debug: (message, meta) => write("debug", console.debug, message, meta),
    info: (message, meta) => write("info", console.info, message, meta),
    warn: (message, meta) => write("warn", console.warn, message, meta),
    error: (message, meta) => write("error", console.error, message, meta),
  };
}
