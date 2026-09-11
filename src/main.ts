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
import {
  createCleanupScheduler,
  DEFAULT_CLEANUP_INTERVAL_MS,
} from "./adapters/timers/cleanup-scheduler.js";
import { loadConfig } from "./infra/config.js";
import { createContainer } from "./infra/container.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

process.on("uncaughtException", (err) =>
  console.error("[process] uncaughtException:", err)
);
process.on("unhandledRejection", (reason) =>
  console.error("[process] unhandledRejection:", reason)
);

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

  // Auto-cierre de partidas `waiting` + poda de la caché (US-08). El
  // scheduler ejecuta de inmediato y cada 5 min, con errores aislados del ciclo.
  const cleanupScheduler = createCleanupScheduler({
    run: async () => {
      await container.useCases.cancelStaleGames.execute();
      await container.repo.prune();
    },
    intervalMs: DEFAULT_CLEANUP_INTERVAL_MS,
    onError: (error) => container.logger.error("[main] cleanup failed", error),
  });
  cleanupScheduler.start();

  httpServer.listen(config.port, () =>
    container.logger.info(`[main] QuizUp WS escuchando en :${config.port}`)
  );
}

void main().catch((err) => {
  console.error("[main] Failed to start:", err);
  process.exit(1);
});
