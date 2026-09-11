import dotenv from "dotenv";
import path from "node:path";
import { connectToMongo } from "./adapters/persistence/mongo/connection.js";
import { registerSocketRouter } from "./adapters/realtime/socketio/event-router.js";
import { createSocketGateway } from "./adapters/realtime/socketio/socket-gateway.js";
import {
  createHttpServer,
  createSocketServer,
} from "./adapters/realtime/socketio/socket-server.adapter.js";
import { createTimeoutScheduler } from "./adapters/timers/timeout-scheduler.js";
import { loadConfig } from "./infra/config.js";
import { createContainer } from "./infra/container.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

process.on("uncaughtException", (err) =>
  console.error("[process] uncaughtException:", err)
);
process.on("unhandledRejection", (reason) =>
  console.error("[process] unhandledRejection:", reason)
);

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Bootstrap del proceso WS: config → conexión Mongo → container (con los
 * adaptadores de borde reales) → router → auto-cierre de partidas expiradas →
 * listen. Reemplaza a `socket-server.ts` (US-07).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  await connectToMongo(config.mongoUri);

  const httpServer = createHttpServer();
  const io = createSocketServer(httpServer, config.corsOrigin);
  const container = createContainer(config, {
    gateway: createSocketGateway(io),
    timers: createTimeoutScheduler(),
  });
  registerSocketRouter(io, container.bus, container.logger);

  // Auto-cierre de partidas `waiting` (paridad legacy; US-08 lo formaliza
  // con `CleanupScheduler`).
  const runCleanup = (): void => {
    void container.useCases.cancelStaleGames.execute().catch((error: unknown) => {
      container.logger.error("[main] cleanup failed", error);
    });
  };
  runCleanup();
  const cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();

  httpServer.listen(config.port, () =>
    container.logger.info(`[main] QuizUp WS escuchando en :${config.port}`)
  );
}

void main().catch((err) => {
  console.error("[main] Failed to start:", err);
  process.exit(1);
});
