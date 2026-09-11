import { cancel } from "../../domain/game-state-machine.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface CloseGameInput {
  gameId: string;
}

export interface CloseGameDeps {
  readonly repo: GameRepository;
  readonly gateway: RealtimeGateway;
}

/**
 * `close-game`: cancela una partida `waiting`, emite `game-cancelled` a sala +
 * admins y refresca el dashboard. Paridad con `adminHandlers.ts:30-52`: si la
 * partida no existe, igualmente se emite `update-dashboard` (allí queda fuera
 * del `if (game)`); sin emisiones de sala/socket.
 */
export function createCloseGameUseCase(deps: CloseGameDeps): UseCase<CloseGameInput, void> {
  const { repo, gateway } = deps;

  return {
    async execute({ gameId }) {
      const game = await repo.findById(gameId);
      if (!game) {
        gateway.broadcast("update-dashboard", await repo.listAll());
        return;
      }
      if (!cancel(game)) return;

      await repo.save(game);
      gateway.toGame(gameId, "game-cancelled", { game });
      gateway.toAdmins(gameId, "game-cancelled", { game });
      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
