import type { ServerToClientEvents } from "../../../types/types.js";

/** Nombres de eventos servidor→cliente del contrato v1.0.0. */
export type ServerEventName = keyof ServerToClientEvents;

/** Payload exacto del evento `E` según el contrato. */
export type ServerEventPayload<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>[0];

export interface RealtimeGateway {
  /** Emite a la sala `game-<gameId>`. */
  toGame<E extends ServerEventName>(gameId: string, event: E, payload: ServerEventPayload<E>): void;

  /** Emite a la sala `game-<gameId>-admins`. */
  toAdmins<E extends ServerEventName>(gameId: string, event: E, payload: ServerEventPayload<E>): void;

  /** Emite a todos los sockets conectados (dashboard). */
  broadcast<E extends ServerEventName>(event: E, payload: ServerEventPayload<E>): void;
}
