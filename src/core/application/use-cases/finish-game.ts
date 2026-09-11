import { finish } from "../../domain/game-state-machine.js";
import { calculateResults } from "../../domain/results/results-calculator.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { TimerService } from "../ports/timer-service.js";
import type { UseCase } from "./use-case.js";

export interface FinishGameInput {
  gameId: string;
}

export interface FinishGameDeps {
  readonly repo: GameRepository;
  readonly gateway: RealtimeGateway;
  readonly timers: TimerService;
}

/**
 * `finish-game`: marca la partida como finished, persiste jugadores y estado y
 * emite `game-finished` a sala + admins + dashboard. Paridad con el handler
 * legacy (limpia el timeout y es no-op si la partida no existe).
 */
export function createFinishGameUseCase(
  deps: FinishGameDeps
): UseCase<FinishGameInput, void> {
  const { repo, gateway, timers } = deps;

  return {
    async execute({ gameId }) {
      timers.clear(gameId);

      const game = await repo.findById(gameId);
      if (!game) return;

      finish(game);
      await repo.persistPlayers(gameId, game.players);
      await repo.save(game);

      const results = calculateResults(game);
      gateway.toGame(gameId, "game-finished", { game, results });
      gateway.toAdmins(gameId, "game-finished", { game, results });
      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
