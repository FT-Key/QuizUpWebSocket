import type { CommandBus } from "../core/application/commands/command-bus.js";
import { createCommandBus } from "../core/application/commands/command-bus.js";
import type { Command } from "../core/application/commands/command.js";
import { createCommands, type UseCases } from "../core/application/commands/commands.js";
import type { Clock } from "../core/application/ports/clock.js";
import type { GameCleanupPolicy } from "../core/application/ports/game-cleanup-policy.js";
import type { GameRepository } from "../core/application/ports/game-repository.js";
import type { IdGenerator } from "../core/application/ports/id-generator.js";
import type { Logger } from "../core/application/ports/logger.js";
import type { RealtimeGateway } from "../core/application/ports/realtime-gateway.js";
import type { TimerService } from "../core/application/ports/timer-service.js";
import { createWaitingGameExpiryPolicy } from "../core/domain/expiry/waiting-game-expiry-policy.js";
import { TimeBonusScoring } from "../core/domain/scoring/time-bonus-scoring.js";
import { createCancelStaleGamesUseCase } from "../core/application/use-cases/cancel-stale-games.js";
import { createCloseGameUseCase } from "../core/application/use-cases/close-game.js";
import { createEmitDashboardUseCase } from "../core/application/use-cases/emit-dashboard.js";
import { createFinishGameUseCase } from "../core/application/use-cases/finish-game.js";
import { createForceFinishQuestionUseCase } from "../core/application/use-cases/force-finish-question.js";
import { createJoinAdminRoomUseCase } from "../core/application/use-cases/join-admin-room.js";
import { createJoinGameUseCase } from "../core/application/use-cases/join-game.js";
import { createLeaveGameUseCase } from "../core/application/use-cases/leave-game.js";
import { createLockGameUseCase } from "../core/application/use-cases/lock-game.js";
import { createNextQuestionUseCase } from "../core/application/use-cases/next-question.js";
import { createRequestGameStateUseCase } from "../core/application/use-cases/request-game-state.js";
import { createStartGameUseCase } from "../core/application/use-cases/start-game.js";
import { createSubmitAnswerUseCase } from "../core/application/use-cases/submit-answer.js";
import { createSystemClock } from "../adapters/system/clock.js";
import { createUuidGenerator } from "../adapters/system/id-generator.js";
import { createMongoGameRepository } from "../adapters/persistence/mongo/game-repository.mongo.js";
import type { AppConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createNoopRealtimeGateway, createNoopTimerService } from "./stubs.js";

/**
 * Composition root del proceso WS. Construye el grafo completo (US-06):
 * puertos → casos de uso → commands → bus, e inyecta los adaptadores de borde
 * que aporta el bootstrap (`deps`, US-07). No conecta a Mongo ni crea el
 * server (eso es `main.ts`). Un container por proceso (ver skill DI).
 */
export interface Container {
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly repo: GameRepository;
  /** Gateway real en `main.ts` (US-07); noop por defecto en tests. */
  readonly gateway: RealtimeGateway;
  /** `TimeoutScheduler` real en `main.ts` (US-07); noop por defecto en tests. */
  readonly timers: TimerService;
  readonly policy: GameCleanupPolicy;
  readonly useCases: UseCases;
  readonly commands: Command<UseCases>[];
  readonly bus: CommandBus<UseCases>;
}

/** Adaptadores de borde que el bootstrap inyecta (Socket.IO y timers reales). */
export interface ContainerDeps {
  /** Repositorio inyectable (tests de contrato/paridad); Mongo real por defecto. */
  repo?: GameRepository;
  gateway?: RealtimeGateway;
  timers?: TimerService;
}

export function createContainer(config: AppConfig, deps: ContainerDeps = {}): Container {
  const logger = createLogger({ level: config.logLevel, context: "quizup-ws" });
  const clock = createSystemClock();
  const ids = createUuidGenerator();
  // Construcción pura: el repo Mongo usa la conexión global de mongoose recién
  // al invocar un método; el bootstrap no lo sustituye.
  const repo = deps.repo ?? createMongoGameRepository();
  const gateway = deps.gateway ?? createNoopRealtimeGateway();
  const timers = deps.timers ?? createNoopTimerService();
  const expiryMs = config.gameExpiryMinutes * 60_000;
  const policy = createWaitingGameExpiryPolicy(expiryMs);
  const scoring = new TimeBonusScoring();

  // `forceFinishQuestion` se construye antes que start/next: ambos lo reciben.
  const forceFinishQuestion = createForceFinishQuestionUseCase({ repo, gateway });

  const useCases: UseCases = {
    joinGame: createJoinGameUseCase({ repo, clock, ids, gateway, policy }),
    joinAdminRoom: createJoinAdminRoomUseCase({ gateway }),
    leaveGame: createLeaveGameUseCase({ repo, gateway }),
    startGame: createStartGameUseCase({ repo, clock, gateway, timers, forceFinishQuestion }),
    submitAnswer: createSubmitAnswerUseCase({ repo, clock, scoring, gateway }),
    nextQuestion: createNextQuestionUseCase({ repo, clock, gateway, timers, forceFinishQuestion }),
    finishGame: createFinishGameUseCase({ repo, gateway, timers }),
    forceFinishQuestion,
    lockGame: createLockGameUseCase({ repo, gateway }),
    closeGame: createCloseGameUseCase({ repo, gateway }),
    requestGameState: createRequestGameStateUseCase({ repo, clock, gateway, policy }),
    cancelStaleGames: createCancelStaleGamesUseCase({
      repo,
      gateway,
      clock,
      policy,
      expiryMs,
    }),
    emitDashboard: createEmitDashboardUseCase({ repo, gateway }),
  };

  const commands = createCommands();
  const bus = createCommandBus({ commands, useCases, logger, clock });

  return { logger, clock, ids, repo, gateway, timers, policy, useCases, commands, bus };
}
