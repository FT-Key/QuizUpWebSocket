import { lock } from "../../domain/game-state-machine.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface LockGameInput {
  gameId: string;
  locked: boolean;
}

export interface LockGameDeps {
  readonly repo: GameRepository;
  readonly gateway: RealtimeGateway;
}

/**
 * `lock-game`: activa/desactiva el bloqueo de ingreso y emite `game-updated`
 * a sala + admins. Paridad con `adminHandlers` (no-op si la partida no existe).
 */
export function createLockGameUseCase(deps: LockGameDeps): UseCase<LockGameInput, void> {
  const { repo, gateway } = deps;

  return {
    async execute({ gameId, locked }) {
      const game = await repo.findById(gameId);
      if (!game) return;

      lock(game, locked);
      await repo.save(game);

      gateway.toGame(gameId, "game-updated", { game });
      gateway.toAdmins(gameId, "game-updated", { game });
    },
  };
}
