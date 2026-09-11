import type {
  RealtimeGateway,
  ServerEventName,
  ServerEventPayload,
} from "../../core/application/ports/realtime-gateway.js";

/** Llamada registrada por el gateway en orden de invocación. */
export interface RecordedEmission {
  kind: "game" | "admins" | "broadcast" | "socket" | "joinGameRoom" | "leaveGameRoom" | "joinAdminRoom";
  gameId?: string;
  socketId?: string;
  event?: string;
  payload?: unknown;
}

export interface RecordingGateway extends RealtimeGateway {
  readonly emissions: RecordedEmission[];
}

/**
 * `RealtimeGateway` de test (US-06): registra cada emisión en orden de llamada
 * para poder asertar payload y secuencia sin socket.io ni red.
 */
export function createRecordingGateway(): RecordingGateway {
  const emissions: RecordedEmission[] = [];

  return {
    emissions,

    toGame<E extends ServerEventName>(gameId: string, event: E, payload: ServerEventPayload<E>) {
      emissions.push({ kind: "game", gameId, event, payload });
    },

    toAdmins<E extends ServerEventName>(gameId: string, event: E, payload: ServerEventPayload<E>) {
      emissions.push({ kind: "admins", gameId, event, payload });
    },

    broadcast<E extends ServerEventName>(event: E, payload: ServerEventPayload<E>) {
      emissions.push({ kind: "broadcast", event, payload });
    },

    toSocket<E extends ServerEventName>(socketId: string, event: E, payload: ServerEventPayload<E>) {
      emissions.push({ kind: "socket", socketId, event, payload });
    },

    joinGameRoom(socketId: string, gameId: string) {
      emissions.push({ kind: "joinGameRoom", socketId, gameId });
    },

    leaveGameRoom(socketId: string, gameId: string) {
      emissions.push({ kind: "leaveGameRoom", socketId, gameId });
    },

    joinAdminRoom(socketId: string, gameId: string) {
      emissions.push({ kind: "joinAdminRoom", socketId, gameId });
    },
  };
}
