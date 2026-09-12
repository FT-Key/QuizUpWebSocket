import { nextQuestion } from "../../domain/game-state-machine.js";
import { calculateResults } from "../../domain/results/results-calculator.js";
import type { Clock } from "../ports/clock.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { TimerService } from "../ports/timer-service.js";
import type { UseCase } from "./use-case.js";

export interface NextQuestionInput {
  gameId: string;
}

export interface NextQuestionDeps {
  readonly repo: GameRepository;
  readonly clock: Clock;
  readonly gateway: RealtimeGateway;
  readonly timers: TimerService;
  readonly forceFinishQuestion: UseCase<{ gameId: string }, void>;
}

/**
 * `next-question`: avanza a la siguiente pregunta o finaliza la partida si era
 * la última. Paridad con `gameHandlers` (limpia el timeout, persiste jugadores
 * y emite `question-changed` o `game-finished` a sala + admins + dashboard).
 */
export function createNextQuestionUseCase(
  deps: NextQuestionDeps
): UseCase<NextQuestionInput, void> {
  const { repo, clock, gateway, timers, forceFinishQuestion } = deps;

  return {
    async execute({ gameId }) {
      timers.clear(gameId);

      const game = await repo.findById(gameId);
      if (!game) return;

      const outcome = nextQuestion(game, clock.now());
      await repo.updatePlayers(gameId, game.players);

      if (outcome === "finished") {
        const results = calculateResults(game);
        gateway.toGame(gameId, "game-finished", { game, results });
        gateway.toAdmins(gameId, "game-finished", { game, results });
      } else {
        timers.scheduleQuestionTimeout(gameId, game.questionTimeLimit, () =>
          forceFinishQuestion.execute({ gameId })
        );

        const payload = {
          question: game.questions[game.currentQuestionIndex],
          questionIndex: game.currentQuestionIndex,
          timeLeft: Math.max(
            0,
            game.questionTimeLimit - (clock.now() - game.currentQuestionStartTime)
          ),
        };
        gateway.toGame(gameId, "question-changed", payload);
        gateway.toAdmins(gameId, "question-changed", payload);
      }

      gateway.broadcast("update-dashboard", await repo.listAll());
    },
  };
}
