import { cancel } from "../../domain/game-state-machine.js";
import type { Clock } from "../ports/clock.js";
import type { GameCleanupPolicy } from "../ports/game-cleanup-policy.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface CancelStaleGamesDeps {
  readonly repo: GameRepository;
  readonly gateway: RealtimeGateway;
  readonly clock: Clock;
  readonly policy: GameCleanupPolicy;
  /** Antigüedad que define una partida `waiting` obsoleta (llega por DI desde config). */
  readonly expiryMs: number;
}

/**
 * `cancel-stale-games` (scheduler US-08): cancela las partidas `waiting`
 * anteriores al cutoff, emite `game-cancelled` por cada una y un único
 * dashboard si hubo cancelaciones. Divergencia intencional vs legacy (D5): se
 * emite por todas las canceladas, no solo por las que estaban en caché.
 */
export function createCancelStaleGamesUseCase(
  deps: CancelStaleGamesDeps
): UseCase<void, void> {
  const { repo, gateway, clock, policy, expiryMs } = deps;

  return {
    async execute() {
      const now = clock.now();
      const cutoff = new Date(now - expiryMs);
      const stale = await repo.findWaitingCreatedBefore(cutoff);

      let cancelledAny = false;
      for (const game of stale) {
        if (!policy.isExpired(game, now)) continue;
        if (!cancel(game)) continue;

        await repo.save(game);
        gateway.toGame(game.id, "game-cancelled", { game });
        gateway.toAdmins(game.id, "game-cancelled", { game });
        cancelledAny = true;
      }

      if (cancelledAny) {
        gateway.broadcast("update-dashboard", await repo.listAll());
      }
    },
  };
}
