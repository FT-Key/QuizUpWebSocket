import { canStart, start } from "../../domain/game-state-machine.js";
import type { Clock } from "../ports/clock.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { TimerService } from "../ports/timer-service.js";
import type { UseCase } from "./use-case.js";

export interface StartGameInput {
  gameId: string;
}

export interface StartGameDeps {
  readonly repo: GameRepository;
  readonly clock: Clock;
  readonly gateway: RealtimeGateway;
  readonly timers: TimerService;
  readonly forceFinishQuestion: UseCase<{ gameId: string }, void>;
}

/**
 * `start-game`: waiting → active, programa el timeout de la pregunta y emite
 * `game-started` a sala + admins. Paridad con el handler legacy (no-op si la
 * partida no existe o no está `waiting`).
 */
export function createStartGameUseCase(deps: StartGameDeps): UseCase<StartGameInput, void> {
  const { repo, clock, gateway, timers, forceFinishQuestion } = deps;

  return {
    async execute({ gameId }) {
      const game = await repo.findById(gameId);
      if (!game || !canStart(game)) return;

      start(game, clock.now());
      await repo.save(game);

      timers.scheduleQuestionTimeout(gameId, game.questionTimeLimit, () =>
        forceFinishQuestion.execute({ gameId })
      );

      const payload = {
        game,
        players: game.players,
        currentQuestion: game.questions[game.currentQuestionIndex],
        timeLeft: Math.max(
          0,
          game.questionTimeLimit - (clock.now() - game.currentQuestionStartTime)
        ),
      };
      gateway.toGame(gameId, "game-started", payload);
      gateway.toAdmins(gameId, "game-started", payload);
      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
