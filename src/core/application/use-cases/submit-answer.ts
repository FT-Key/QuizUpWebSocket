import type { Game } from "../../domain/game.js";
import type { Player } from "../../domain/player.js";
import { finishCurrentQuestion } from "../../domain/game-state-machine.js";
import type { ScoringStrategy } from "../../domain/scoring/scoring-strategy.js";
import type { Clock } from "../ports/clock.js";
import type { GameRepository } from "../ports/game-repository.js";
import type { RealtimeGateway } from "../ports/realtime-gateway.js";
import type { UseCase } from "./use-case.js";

export interface SubmitAnswerInput {
  gameId: string;
  playerId: string;
  questionId: string;
  answer: number;
  socketId: string;
}

export interface SubmitAnswerOutput {
  game: Game;
  player: Player;
  finishedQuestion: boolean;
}

export interface SubmitAnswerDeps {
  readonly repo: GameRepository;
  readonly clock: Clock;
  readonly scoring: ScoringStrategy;
  readonly gateway: RealtimeGateway;
}

/**
 * `submit-answer`: registra la respuesta, aplica scoring y detecta
 * `allAnswered`. Paridad exacta con `socket-server.ts` + `gameStore.submitAnswer`:
 * - localiza la partida por jugador (ignora `gameId`, D4);
 * - **no persiste** (el legacy tampoco);
 * - un duplicado vuelve a sumar (bug congelado);
 * - mismo orden de emisiones: answer-submitted→socket, game-updated→game+admins
 *   y question-finished→game+admins solo si todos respondieron.
 * Devuelve `null` sin emisiones si el jugador o la pregunta no existen.
 */
export function createSubmitAnswerUseCase(
  deps: SubmitAnswerDeps
): UseCase<SubmitAnswerInput, SubmitAnswerOutput | null> {
  const { repo, clock, scoring, gateway } = deps;

  return {
    async execute({ playerId, questionId, answer, socketId }) {
      const game = await repo.findByPlayerId(playerId);
      if (!game) return null;

      const question = game.questions.find((q) => q.id === questionId);
      if (!question) return null;

      const player = game.players.find((p) => p.id === playerId);
      if (!player) return null;

      player.answers[questionId] = answer;

      const remainingMs = game.questionTimeLimit - (clock.now() - game.currentQuestionStartTime);
      player.score += scoring.calculate({
        isCorrect: answer === question.correctAnswer,
        remainingMs,
      });

      const allAnswered = game.players.every((p) => p.answers[questionId] !== undefined);
      let finishedQuestion = false;
      if (allAnswered) {
        finishCurrentQuestion(game);
        finishedQuestion = true;
      }

      gateway.toSocket(socketId, "answer-submitted", { playerId, questionId, answer });

      const gameId = game.id;
      gateway.toGame(gameId, "game-updated", { game });
      gateway.toAdmins(gameId, "game-updated", { game });

      if (finishedQuestion) {
        const currentQuestionIndex = game.currentQuestionIndex;
        gateway.toGame(gameId, "question-finished", { currentQuestionIndex });
        gateway.toAdmins(gameId, "question-finished", { currentQuestionIndex });
      }

      return { game, player, finishedQuestion };
    },
  };
}
