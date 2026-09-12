import {
  closeGameSchema,
  finishGameSchema,
  finishQuestionSchema,
  joinAdminSchema,
  joinGameSchema,
  leaveGameSchema,
  lockGameSchema,
  nextQuestionSchema,
  requestDashboardSchema,
  requestGameStateSchema,
  startGameSchema,
  submitAnswerSchema,
} from "../dto/socket-payloads.js";
import type { UseCase } from "../use-cases/use-case.js";
import type { JoinAdminRoomInput } from "../use-cases/join-admin-room.js";
import type { JoinGameUseCase } from "../use-cases/join-game.js";
import type { LeaveGameInput } from "../use-cases/leave-game.js";
import type { StartGameInput } from "../use-cases/start-game.js";
import type { SubmitAnswerInput, SubmitAnswerOutput } from "../use-cases/submit-answer.js";
import type { NextQuestionInput } from "../use-cases/next-question.js";
import type { FinishGameInput } from "../use-cases/finish-game.js";
import type { ForceFinishQuestionInput } from "../use-cases/force-finish-question.js";
import type { LockGameInput } from "../use-cases/lock-game.js";
import type { CloseGameInput } from "../use-cases/close-game.js";
import type { RequestGameStateInput } from "../use-cases/request-game-state.js";
import { createCommand, type Command } from "./command.js";

/** Bundle de casos de uso que consumen los commands (composition root: container). */
export interface UseCases {
  readonly joinGame: JoinGameUseCase;
  readonly joinAdminRoom: UseCase<JoinAdminRoomInput, void>;
  readonly leaveGame: UseCase<LeaveGameInput, void>;
  readonly startGame: UseCase<StartGameInput, void>;
  readonly submitAnswer: UseCase<SubmitAnswerInput, SubmitAnswerOutput | null>;
  readonly nextQuestion: UseCase<NextQuestionInput, void>;
  readonly finishGame: UseCase<FinishGameInput, void>;
  readonly forceFinishQuestion: UseCase<ForceFinishQuestionInput, void>;
  readonly lockGame: UseCase<LockGameInput, void>;
  readonly closeGame: UseCase<CloseGameInput, void>;
  readonly requestGameState: UseCase<RequestGameStateInput, void>;
  readonly cancelStaleGames: UseCase<void, void>;
  readonly emitDashboard: UseCase<void, void>;
}

/**
 * Los 12 commands del contrato v1.0.0 §2.1 (uno por evento cliente→servidor),
 * en el mismo orden que `ClientToServerEvents`. Cada uno es solo traducción:
 * valida el schema del bus y delega en su caso de uso, pasando `socketId`
 * cuando el evento responde a un socket concreto.
 */
export function createCommands(): Command<UseCases>[] {
  return [
    createCommand<UseCases, typeof joinGameSchema>({
      type: "join-game",
      schema: joinGameSchema,
      execute: async ({ payload, context, useCases }) => {
        await useCases.joinGame.execute({ ...payload, socketId: context.socketId });
      },
    }),

    createCommand<UseCases, typeof joinAdminSchema>({
      type: "join-admin",
      schema: joinAdminSchema,
      execute: async ({ payload, context, useCases }) => {
        await useCases.joinAdminRoom.execute({
          gameId: payload,
          socketId: context.socketId,
        });
      },
    }),

    createCommand<UseCases, typeof startGameSchema>({
      type: "start-game",
      schema: startGameSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.startGame.execute({ gameId: payload.gameId });
      },
    }),

    createCommand<UseCases, typeof nextQuestionSchema>({
      type: "next-question",
      schema: nextQuestionSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.nextQuestion.execute({ gameId: payload.gameId });
      },
    }),

    createCommand<UseCases, typeof finishQuestionSchema>({
      type: "finish-question",
      schema: finishQuestionSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.forceFinishQuestion.execute({ gameId: payload.gameId });
      },
    }),

    createCommand<UseCases, typeof finishGameSchema>({
      type: "finish-game",
      schema: finishGameSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.finishGame.execute({ gameId: payload.gameId });
      },
    }),

    createCommand<UseCases, typeof submitAnswerSchema>({
      type: "submit-answer",
      schema: submitAnswerSchema,
      execute: async ({ payload, context, useCases }) => {
        await useCases.submitAnswer.execute({ ...payload, socketId: context.socketId });
      },
    }),

    createCommand<UseCases, typeof leaveGameSchema>({
      type: "leave-game",
      schema: leaveGameSchema,
      execute: async ({ payload, context, useCases }) => {
        await useCases.leaveGame.execute({ ...payload, socketId: context.socketId });
      },
    }),

    createCommand<UseCases, typeof lockGameSchema>({
      type: "lock-game",
      schema: lockGameSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.lockGame.execute({
          gameId: payload.gameId,
          locked: payload.locked,
        });
      },
    }),

    createCommand<UseCases, typeof closeGameSchema>({
      type: "close-game",
      schema: closeGameSchema,
      execute: async ({ payload, useCases }) => {
        await useCases.closeGame.execute({ gameId: payload.gameId });
      },
    }),

    createCommand<UseCases, typeof requestDashboardSchema>({
      type: "request-dashboard",
      schema: requestDashboardSchema,
      execute: async ({ useCases }) => {
        await useCases.emitDashboard.execute();
      },
    }),

    createCommand<UseCases, typeof requestGameStateSchema>({
      type: "request-game-state",
      schema: requestGameStateSchema,
      execute: async ({ payload, context, useCases }) => {
        await useCases.requestGameState.execute({
          gameId: payload.gameId,
          socketId: context.socketId,
        });
      },
    }),
  ];
}
