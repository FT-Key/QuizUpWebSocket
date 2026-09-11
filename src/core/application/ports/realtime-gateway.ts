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

  /** Emite a un socket concreto (respuestas individuales: `joined`, `join-error`, `answer-submitted`, `game-state`). */
  toSocket<E extends ServerEventName>(socketId: string, event: E, payload: ServerEventPayload<E>): void;

  /** Mete al socket en la sala `game-<gameId>` (join-game). */
  joinGameRoom(socketId: string, gameId: string): void;

  /** Saca al socket de la sala `game-<gameId>` (leave-game). */
  leaveGameRoom(socketId: string, gameId: string): void;

  /** Mete al socket en la sala `game-<gameId>-admins` (join-admin). */
  joinAdminRoom(socketId: string, gameId: string): void;
}
