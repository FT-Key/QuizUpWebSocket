import type { LogLevel } from "../core/application/ports/logger.js";

export interface AppConfig {
  readonly port: number;
  readonly mongoUri: string;
  readonly gameExpiryMinutes: number;
  readonly corsOrigin: string;
  readonly logLevel: LogLevel;
}

const DEFAULT_PORT = 4000;
const DEFAULT_GAME_EXPIRY_MINUTES = 60;
const DEFAULT_CORS_ORIGIN = "*";
const DEFAULT_LOG_LEVEL: LogLevel = "info";
const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/**
 * Lee la configuración del proceso. NO carga `.env`: eso es responsabilidad del
 * bootstrap (hoy `socket-server.ts`/`mongoose.ts`, en US-07 `main.ts`). Recibir
 * `env` por parámetro mantiene la función pura y testeable sin tocar process.env.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongoUri = env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error("❌ MONGODB_URI no está definido en el .env");
  }

  return {
    port: parsePort(env.PORT),
    mongoUri,
    gameExpiryMinutes: parseGameExpiryMinutes(env.GAME_EXPIRY_MINUTES),
    corsOrigin: env.CORS_ORIGIN?.trim() || DEFAULT_CORS_ORIGIN,
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`❌ PORT inválido: "${raw}". Debe ser un entero entre 1 y 65535.`);
  }
  return port;
}

/**
 * Conserva el comportamiento actual de `getWaitingGameExpiryMs()`: un valor
 * ausente o inválido (NaN, 0, negativo) cae a 60 minutos, no rompe el proceso.
 */
function parseGameExpiryMinutes(raw: string | undefined): number {
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_GAME_EXPIRY_MINUTES;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const level = raw?.trim().toLowerCase();
  return isLogLevel(level) ? level : DEFAULT_LOG_LEVEL;
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && (LOG_LEVELS as readonly string[]).includes(value);
}
