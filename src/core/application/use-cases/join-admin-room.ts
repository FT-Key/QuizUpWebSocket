import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface JoinAdminRoomInput {
  gameId: string;
  socketId: string;
}

/**
 * `join-admin`: evento sin lógica de negocio; solo mete al socket en la sala
 * de administradores a través del gateway (US-06 D2).
 */
export function createJoinAdminRoomUseCase(deps: {
  gateway: RealtimeGateway;
}): UseCase<JoinAdminRoomInput, void> {
  return {
    async execute({ gameId, socketId }) {
      deps.gateway.joinAdminRoom(socketId, gameId);
    },
  };
}
