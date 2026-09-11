import { finishCurrentQuestion } from "../../domain/game-state-machine.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface ForceFinishQuestionInput {
  gameId: string;
}

export interface ForceFinishQuestionDeps {
  readonly repo: GameRepository;
  readonly gateway: RealtimeGateway;
}

/**
 * `finish-question` / timeout de pregunta: cierra la pregunta actual
 * (`currentQuestionStartTime = 0`), persiste jugadores y emite
 * `question-finished` y `game-updated` a sala + admins.
 * Paridad con el timeout legacy: guards de `active` y `startTime !== 0`,
 * y **sin** dashboard.
 */
export function createForceFinishQuestionUseCase(
  deps: ForceFinishQuestionDeps
): UseCase<ForceFinishQuestionInput, void> {
  const { repo, gateway } = deps;

  return {
    async execute({ gameId }) {
      const game = await repo.findById(gameId);
      if (!game || game.status !== "active" || game.currentQuestionStartTime === 0) return;

      finishCurrentQuestion(game);
      await repo.persistPlayers(gameId, game.players);

      const currentQuestionIndex = game.currentQuestionIndex;
      gateway.toGame(gameId, "question-finished", { currentQuestionIndex });
      gateway.toAdmins(gameId, "question-finished", { currentQuestionIndex });
      gateway.toGame(gameId, "game-updated", { game });
      gateway.toAdmins(gameId, "game-updated", { game });
    },
  };
}
