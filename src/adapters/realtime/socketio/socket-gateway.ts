import type { Server } from "socket.io";
import type {
  RealtimeGateway,
  ServerEventName,
  ServerEventPayload,
} from "../../../core/application/ports/realtime-gateway.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../../types/types.js";

/** Server Socket.IO tipado con los eventos del contrato (sin `any`). */
export type QuizUpSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Salas del contrato §2.1: **única definición en todo el repo**. Cualquier
 * emisión del runtime nuevo sale por este gateway, así que los strings de sala
 * no se repiten en casos de uso, router ni bootstrap.
 */
function gameRoom(gameId: string): string {
  return `game-${gameId}`;
}

function adminRoom(gameId: string): string {
  return `game-${gameId}-admins`;
}

/**
 * Puente de tipado de la emisión. Socket.IO decora cada evento con
 * acknowledgements (`DecorateAcknowledgementsWithMultipleResponses`), así que
 * un `emit(event, payload)` genérico no es asignable a su firma aunque el
 * payload sí cumpla el contrato. La puerta pública del gateway ya valida el
 * tipo exacto por evento (`ServerEventPayload<E>`); aquí solo se cruza el borde
 * del framework, sin `any`.
 */
function emitTo<E extends ServerEventName>(
  target: unknown,
  event: E,
  payload: ServerEventPayload<E>
): void {
  const emitter = target as {
    emit(event: E, payload: ServerEventPayload<E>): unknown;
  };
  emitter.emit(event, payload);
}

/**
 * `RealtimeGateway` real sobre Socket.IO (Adapter/Observer). Los casos de uso
 * lo reciben por parámetro y nunca tocan `io`. Un socket inexistente no lanza:
 * `join`/`leave` simplemente no tienen destinatario (deuda US-06).
 */
export function createSocketGateway(io: QuizUpSocketServer): RealtimeGateway {
  return {
    toGame(gameId, event, payload) {
      emitTo(io.to(gameRoom(gameId)), event, payload);
    },

    toAdmins(gameId, event, payload) {
      emitTo(io.to(adminRoom(gameId)), event, payload);
    },

    broadcast(event, payload) {
      emitTo(io, event, payload);
    },

    toSocket(socketId, event, payload) {
      // En Socket.IO un id de socket es una room de un solo miembro.
      emitTo(io.to(socketId), event, payload);
    },

    joinGameRoom(socketId, gameId) {
      io.sockets.sockets.get(socketId)?.join(gameRoom(gameId));
    },

    leaveGameRoom(socketId, gameId) {
      io.sockets.sockets.get(socketId)?.leave(gameRoom(gameId));
    },

    joinAdminRoom(socketId, gameId) {
      io.sockets.sockets.get(socketId)?.join(adminRoom(gameId));
    },
  };
}
