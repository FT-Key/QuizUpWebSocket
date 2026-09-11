import { cancel } from "../../domain/game-state-machine.js";
import type { Clock } from "../ports/clock.js";
import type { GameCleanupPolicy } from "../ports/game-cleanup-policy.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface RequestGameStateInput {
  gameId: string;
  socketId: string;
}

export interface RequestGameStateDeps {
  readonly repo: GameRepository;
  readonly clock: Clock;
  readonly gateway: RealtimeGateway;
  readonly policy: GameCleanupPolicy;
}

/**
 * `request-game-state`: responde el estado al socket solicitante. Si la partida
 * `waiting` expiró, la cancela y emite `game-cancelled` a sala + admins antes de
 * responder. Paridad con `gameHandlers` (timeLeft 0 si la pregunta no inició).
 */
export function createRequestGameStateUseCase(
  deps: RequestGameStateDeps
): UseCase<RequestGameStateInput, void> {
  const { repo, clock, gateway, policy } = deps;

  return {
    async execute({ gameId, socketId }) {
      const game = await repo.findById(gameId);
      if (!game) return;

      if (game.status === "waiting" && policy.isExpired(game, clock.now())) {
        cancel(game);
        await repo.save(game);
        gateway.toGame(gameId, "game-cancelled", { game });
        gateway.toAdmins(gameId, "game-cancelled", { game });
      }

      const timeLeft =
        game.currentQuestionStartTime > 0
          ? Math.max(
              0,
              game.questionTimeLimit - (clock.now() - game.currentQuestionStartTime)
            )
          : 0;

      gateway.toSocket(socketId, "game-state", {
        game,
        currentQuestion: game.questions[game.currentQuestionIndex] ?? null,
        currentQuestionIndex: game.currentQuestionIndex,
        timeLeft,
      });
    },
  };
}
