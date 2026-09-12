import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface LeaveGameInput {
  gameId: string;
  playerId: string;
  socketId: string;
}

/**
 * `leave-game`: quita al jugador de la partida y del room, notifica a admins y
 * sala y refresca el dashboard. Paridad con `playerHandlers.onLeaveGame`:
 * el dashboard se emite siempre, también si la partida no existe (allí
 * `emitDashboard` corre fuera del `if (storeGame)`; sin emisiones de sala).
 */
export function createLeaveGameUseCase(deps: {
  repo: GameRepository;
  gateway: RealtimeGateway;
}): UseCase<LeaveGameInput, void> {
  const { repo, gateway } = deps;

  return {
    async execute({ gameId, playerId, socketId }) {
      const game = await repo.findById(gameId);
      if (!game) {
        gateway.broadcast("update-dashboard", await repo.listAll());
        return;
      }

      game.players = game.players.filter((p) => p.id !== playerId);
      await repo.removePlayer(gameId, playerId);

      gateway.leaveGameRoom(socketId, gameId);
      gateway.toAdmins(gameId, "player-left", { playerId, game });
      gateway.toGame(gameId, "player-left", { playerId, game });
      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
