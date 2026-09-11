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
 * admins y refresca el dashboard. Paridad con `adminHandlers` (no-op si no
 * existe o no está `waiting`).
 */
export function createCloseGameUseCase(deps: CloseGameDeps): UseCase<CloseGameInput, void> {
  const { repo, gateway } = deps;

  return {
    async execute({ gameId }) {
      const game = await repo.findById(gameId);
      if (!game) return;
      if (!cancel(game)) return;

      await repo.save(game);
      gateway.toGame(gameId, "game-cancelled", { game });
      gateway.toAdmins(gameId, "game-cancelled", { game });
      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
