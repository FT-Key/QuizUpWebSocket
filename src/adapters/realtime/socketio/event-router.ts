import type { Server, Socket } from "socket.io";
import type { CommandBus } from "../../../core/application/commands/command-bus.js";
import type { UseCases } from "../../../core/application/commands/commands.js";
import type { Logger } from "../../../core/application/ports/logger.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../../types/types.js";

type ClientEventName = keyof ClientToServerEvents;

/**
 * Router fino (Facade): traduce los 12 eventos cliente→servidor del contrato a
 * `bus.dispatch` con el `socketId` como contexto. No conoce salas, dominio ni
 * `io`: solo registra listeners y delega. Un fallo del bus se loguea y no tumba
 * el socket (política D4, paridad con el runtime legacy).
 */
export function registerSocketRouter(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  bus: CommandBus<UseCases>,
  logger: Logger
): void {
  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    const dispatch = (type: ClientEventName, raw: unknown): void => {
      void bus.dispatch(type, raw, { socketId: socket.id }).catch((error: unknown) => {
        logger.error(`[router] ${type} failed`, error);
      });
    };

    socket.on("join-game", (raw) => dispatch("join-game", raw));
    socket.on("join-admin", (raw) => dispatch("join-admin", raw));
    socket.on("start-game", (raw) => dispatch("start-game", raw));
    socket.on("next-question", (raw) => dispatch("next-question", raw));
    socket.on("finish-question", (raw) => dispatch("finish-question", raw));
    socket.on("finish-game", (raw) => dispatch("finish-game", raw));
    socket.on("submit-answer", (raw) => dispatch("submit-answer", raw));
    socket.on("leave-game", (raw) => dispatch("leave-game", raw));
    socket.on("lock-game", (raw) => dispatch("lock-game", raw));
    socket.on("close-game", (raw) => dispatch("close-game", raw));
    // El cliente emite `socket.emit(event, undefined)`; args[0] puede ser null.
    socket.on("request-dashboard", (...args: unknown[]) =>
      dispatch("request-dashboard", args[0])
    );
    socket.on("request-game-state", (raw) => dispatch("request-game-state", raw));
  });
}
